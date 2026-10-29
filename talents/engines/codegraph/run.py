#!/usr/bin/env python3
"""iCode Knowledge codegraph build/update wrapper (Python 3.9+ standard library only).

Usage: run.py --input-file <absolute path to the iCode Knowledge execution JSON>
       run.py --check   (the engine self-check: environment and `codegraph --version`)

The input names either one repository or one member of a repository set (iCode Knowledge runs a set task
once per member); either way exactly one repository is indexed, in <repo>/.codegraph:
  database missing and .codegraph absent or empty  -> codegraph init <repo> --yes
  database present and status complete             -> codegraph sync <repo>
  anything else                                    -> fail; never index, uninit, unlock or delete
The script exits 0 only after `codegraph status --json` confirms a complete index for this
repository with no pending references. The repository's `git` (main branch, the commit iCode Knowledge synced
it to, and the previous build's commit) is only logged: codegraph sync finds what changed by itself.
"""

import json
import os
import shutil
import stat
import subprocess
import sys

PREFIX = '[icode-knowledge-codegraph]'
STATUS_LIMIT = 1024 * 1024
GIT_REDIRECTS = ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
                 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')
RECOVERY_HINT = ('请先停止该仓库相关的构建、同步及 MCP 进程（包括 iCode 中打开该仓库的 codegraph MCP），'
                 '再在 iCode Knowledge 之外手动恢复索引（例如在仓库根目录运行 codegraph index）；'
                 'iCode Knowledge 不会自动重建、解锁或删除索引文件。')
# codegraph index cannot start without codegraph.db, so the only way back is a fresh build.
MISSING_DB_HINT = ('codegraph index 在缺少 codegraph.db 时无法恢复。请先停止该仓库相关的构建、同步及 MCP 进程'
                   '（包括 iCode 中打开该仓库的 codegraph MCP），再删除整个 .codegraph/ 目录（其中的配置会一并删除，需要时先备份），'
                   '然后用 iCode Knowledge 重新构建；iCode Knowledge 不会自动删除索引文件。')


class Failure(Exception):
    pass


WINDOWS = sys.platform == 'win32'
# The arguments codegraph's own bin\codegraph.cmd (v1.6.0) passes to the bundled node.exe.
WINDOWS_NODE_FLAGS = ['--liftoff-only', '--disable-warning=ExperimentalWarning']


def codegraph_command():
    """argv prefix that starts codegraph. Windows cannot start the bundle's .cmd launcher without
    cmd.exe, which would expand '%' in repository paths, so the bundled node.exe runs the entry
    directly, as codegraph's own npm shim does on Windows."""
    found = shutil.which('codegraph')
    if found is None:
        raise Failure('在 iCode Knowledge 后端的 PATH 中找不到 codegraph。请按 README 安装后重试。')
    if not WINDOWS:
        return ['codegraph']
    if found.lower().endswith('.exe'):
        return [found]
    root = os.path.dirname(os.path.dirname(found))
    node = os.path.join(root, 'node.exe')
    entry = os.path.join(root, 'lib', 'dist', 'bin', 'codegraph.js')
    if not found.lower().endswith('.cmd') or not os.path.isfile(node) or not os.path.isfile(entry):
        raise Failure('PATH 中的 codegraph 是 %s，不是 install.ps1 安装的 codegraph 安装包（应有 %s 和 %s）。'
                      'Windows 上只支持 install.ps1 安装的 codegraph，npm 全局安装的不支持；请按 README 安装后重试。' % (found, node, entry))
    return [node] + WINDOWS_NODE_FLAGS + [entry]


def same_path(left, right):
    """Path equality for codegraph's reported paths; Windows paths compare without case."""
    return isinstance(left, str) and os.path.normcase(left) == os.path.normcase(right)


def say(message):
    print('%s %s' % (PREFIX, message), flush=True)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key: %s' % key)
        result[key] = value
    return result


def reject_constant(name):
    raise ValueError('non-finite number %s is not allowed' % name)


def strict_json(text, what):
    try:
        return json.loads(text, object_pairs_hook=no_duplicates, parse_constant=reject_constant)
    except ValueError as error:
        raise Failure('%s 不是合法 JSON：%s' % (what, error))


def read_input(argv):
    if len(argv) != 2 or argv[0] != '--input-file' or not os.path.isabs(argv[1]):
        raise Failure('用法：run.py --input-file <绝对路径>')
    try:
        with open(argv[1], 'rb') as handle:
            raw = handle.read()
        document = strict_json(raw.decode('utf-8'), '输入文件')
    except (OSError, UnicodeDecodeError) as error:
        raise Failure('无法读取输入文件 %s：%s' % (argv[1], error))
    if not isinstance(document, dict) or set(document) != {'input', 'output'}:
        raise Failure('输入文件必须只包含 input 与 output')
    data, output = document['input'], document['output']
    if not isinstance(data, dict) or set(data) not in ({'repositories'}, {'repositorySet'}):
        raise Failure('input 必须只包含 repositories 或 repositorySet 之一')
    member = None
    git = None
    if 'repositories' in data:
        repositories = data['repositories']
        if not isinstance(repositories, list) or len(repositories) != 1:
            raise Failure('codegraph 每次执行必须恰好一个仓库')
        repository = repositories[0]
        if not isinstance(repository, dict) or set(repository) - {'git'} != {'sourceId', 'path'} or not isinstance(repository['path'], str):
            raise Failure('仓库项必须包含 sourceId 与 path，另可有 git')
        repo = repository['path']
        git = read_git(repository.get('git'), '仓库项的 git')
    else:
        member = read_member(data['repositorySet'])
        repo = member['path']
        git = member['git']
    if not isinstance(output, dict) or set(output) != {'index'} or not isinstance(output['index'], dict) \
            or set(output['index']) != {'path'} or not isinstance(output['index']['path'], str):
        raise Failure('output 必须只包含 index.path')
    return repo, output['index']['path'], member, git


def positive(value):
    return type(value) is int and value > 0


def read_git(value, label):
    """The code version iCode Knowledge synced the repository to: {branch, sync, commit, previous}, previous
    being null or {branch, commit, available, operation, executionId, recordedAt}. None when absent."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'branch', 'sync', 'commit', 'previous'} \
            or not isinstance(value['branch'], str) or value['sync'] not in ('pull', 'local') or not isinstance(value['commit'], str):
        raise Failure('%s 必须包含 branch、sync、commit 与 previous' % label)
    previous = value['previous']
    if previous is not None and (not isinstance(previous, dict) or not isinstance(previous.get('commit'), str)):
        raise Failure('%s.previous 必须为 null 或包含 commit 的对象' % label)
    return value


def read_member(repository_set):
    """The member this execution processes, after checking it against the set: <set>/<name>, listed
    in members at its position. Returns the member with the set root added."""
    if not isinstance(repository_set, dict) or set(repository_set) != {'sourceId', 'path', 'members', 'member'} \
            or not isinstance(repository_set['path'], str):
        raise Failure('repositorySet 必须只包含 sourceId、path、members 与 member')
    members = repository_set['members']
    if not isinstance(members, list) or not members or any(
            not isinstance(item, dict) or set(item) != {'name', 'path'} or not isinstance(item['name'], str) or not isinstance(item['path'], str)
            for item in members):
        raise Failure('repositorySet.members 必须是由 name 与 path 组成的非空列表')
    member = repository_set['member']
    if not isinstance(member, dict) or set(member) - {'git'} != {'name', 'path', 'index', 'total'} \
            or not isinstance(member['name'], str) or not isinstance(member['path'], str) \
            or not positive(member['index']) or not positive(member['total']):
        raise Failure('repositorySet.member 必须包含 name、path、index 与 total，另可有 git')
    member = dict(member, git=read_git(member.get('git'), 'repositorySet.member.git'))
    if member['total'] != len(members) or member['index'] > member['total'] \
            or members[member['index'] - 1] != {'name': member['name'], 'path': member['path']}:
        raise Failure('repositorySet.member 与 members 中第 %r 个子仓不一致' % member['index'])
    if member['path'] != os.path.join(repository_set['path'], member['name']):
        raise Failure('子仓 %s 的路径 %s 不在集合根目录 %s 下' % (member['name'], member['path'], repository_set['path']))
    return dict(member, root=repository_set['path'])


def check_environment():
    if 'CODEGRAPH_DIR' in os.environ:
        raise Failure('检测到环境变量 CODEGRAPH_DIR（值：%r）。首版只使用仓库内默认 .codegraph 目录；'
                      '请从 iCode Knowledge 后端的启动环境中取消该变量后重试。未运行任何 codegraph 命令。' % os.environ['CODEGRAPH_DIR'])
    present = [name for name in GIT_REDIRECTS if name in os.environ]
    if present:
        raise Failure('检测到会让 git 读取其他仓库的环境变量：%s。请从 iCode Knowledge 后端的启动环境中取消后重试；'
                      '脚本不会删除或改写这些变量。未运行任何 codegraph 命令。' % ', '.join(present))


def check_repository(repo, index):
    if not os.path.isabs(repo) or os.path.realpath(repo) != repo:
        raise Failure('仓库路径不是规范的绝对路径：%s' % repo)
    try:
        info = os.lstat(repo)
    except OSError as error:
        raise Failure('无法访问仓库 %s：%s' % (repo, error))
    if not stat.S_ISDIR(info.st_mode):
        raise Failure('仓库路径不是目录：%s' % repo)
    expected = os.path.join(repo, '.codegraph')
    if index != expected:
        raise Failure('产物路径 %s 与本仓索引目录 %s 不一致' % (index, expected))


def index_state(index):
    """'init' when the database is missing and the directory is absent or empty; 'existing' otherwise."""
    try:
        info = os.lstat(index)
    except FileNotFoundError:
        return 'init'
    except OSError as error:
        raise Failure('无法读取索引目录 %s：%s' % (index, error))
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise Failure('索引位置 %s 不是普通目录（可能是文件或软链接）；不会自动处理。%s' % (index, RECOVERY_HINT))
    database = os.path.join(index, 'codegraph.db')
    try:
        db_info = os.lstat(database)
    except FileNotFoundError:
        try:
            entries = sorted(os.listdir(index))
        except OSError as error:
            raise Failure('无法读取索引目录 %s：%s；不会当作空目录处理。' % (index, error))
        if entries:
            shown = ', '.join(entries[:10]) + (' …' if len(entries) > 10 else '')
            raise Failure('索引目录 %s 非空但缺少 codegraph.db（现有：%s）；不会自动初始化或删除任何文件。%s' % (index, shown, MISSING_DB_HINT))
        return 'init'
    except OSError as error:
        raise Failure('无法读取索引数据库 %s：%s' % (database, error))
    if not stat.S_ISREG(db_info.st_mode):
        raise Failure('索引数据库 %s 不是普通文件；%s' % (database, RECOVERY_HINT))
    return 'existing'


def run_native(command, args, repo):
    """init/sync: output goes straight to the platform log; non-zero fails immediately."""
    say('运行：codegraph %s' % ' '.join(args))
    try:
        completed = subprocess.run(command + args, cwd=repo, stdin=subprocess.DEVNULL, shell=False)
    except OSError as error:
        raise Failure('无法启动 codegraph：%s' % error)
    if completed.returncode != 0:
        raise Failure('codegraph %s 失败，退出码 %d；不会重试、重建或调用 index。' % (args[0], completed.returncode))


def read_status(command, repo):
    """Runs status --json; stdout is captured (max 1 MiB, then drained), stderr is forwarded."""
    try:
        process = subprocess.Popen(command + ['status', repo, '--json'], cwd=repo, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, shell=False)
    except OSError as error:
        raise Failure('无法启动 codegraph status：%s' % error)
    captured = bytearray()
    overflow = False
    while True:
        chunk = process.stdout.read(65536)
        if not chunk:
            break
        if len(captured) + len(chunk) > STATUS_LIMIT:
            overflow = True
        else:
            captured.extend(chunk)
    code = process.wait()
    if code != 0:
        raise Failure('codegraph status 失败，退出码 %d（数据库可能无法打开、被锁或已损坏）；%s' % (code, RECOVERY_HINT))
    if overflow:
        raise Failure('codegraph status 的输出超过 1 MiB，不符合状态合同。')
    try:
        text = captured.decode('utf-8')
    except UnicodeDecodeError as error:
        raise Failure('codegraph status 的输出不是合法 UTF-8：%s' % error)
    value = strict_json(text, 'codegraph status 输出')
    if not isinstance(value, dict):
        raise Failure('codegraph status 输出必须是一个 JSON 对象')
    return value


def count(value, name):
    if type(value) is not int or value < 0:
        raise Failure('status 字段 %s 必须是非负整数，实际为 %r' % (name, value))
    return value


def check_identity(status, repo, index):
    if status.get('initialized') is not True:
        raise Failure('status 显示本仓未初始化（initialized=%r）' % status.get('initialized'))
    if not same_path(status.get('projectPath'), repo):
        raise Failure('status 的 projectPath %r 与本仓 %s 不一致（可能命中了父仓索引）' % (status.get('projectPath'), repo))
    if not same_path(status.get('indexPath'), index):
        raise Failure('status 的 indexPath %r 与产物路径 %s 不一致' % (status.get('indexPath'), index))
    details = status.get('index')
    if not isinstance(details, dict):
        raise Failure('status 缺少 index 对象')
    return details


def verify(status, repo, index, synced):
    details = check_identity(status, repo, index)
    if details.get('state') != 'complete':
        raise Failure('索引状态为 %r，不是 complete。%s' % (details.get('state'), RECOVERY_HINT))
    pending_refs = count(details.get('pendingRefs'), 'index.pendingRefs')
    changes = status.get('pendingChanges')
    if not isinstance(changes, dict):
        raise Failure('status 缺少 pendingChanges 对象')
    added, modified, removed = (count(changes.get(key), 'pendingChanges.' + key) for key in ('added', 'modified', 'removed'))
    reindex = details.get('reindexRecommended')
    if type(reindex) is not bool:
        raise Failure('status 字段 index.reindexRecommended 必须是布尔值，实际为 %r' % (reindex,))
    if pending_refs != 0:
        raise Failure('仍有 %d 个待解析引用（pendingRefs），索引不完整；不会循环同步或重建。' % pending_refs)
    if added or modified or removed:
        say('提示：仍有待同步变化（新增 %d、修改 %d、删除 %d）。' % (added, modified, removed))
        if synced:
            say('可能有改动尚未同步：可能另一同步正在进行，或运行期间又有新改动，可稍后再次更新。')
    if reindex:
        say('提示：codegraph 建议重建索引（reindexRecommended=true）；本次仍按成功处理，不会自动重建。')
    if status.get('fileCount') == 0:
        say('提示：索引中没有文件。这可能是合法的空索引，取决于 codegraph 支持的语言与采集规则。')


def self_check():
    """The engine self-check iCode Knowledge runs before every build and update: the same environment checks
    and the same codegraph lookup as a build, then `codegraph --version`."""
    try:
        check_environment()
        command = codegraph_command()
        try:
            result = subprocess.run(command + ['--version'], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Failure('无法运行 codegraph --version：%s' % error)
        if result.returncode != 0:
            raise Failure('codegraph --version 以退出码 %d 结束：%s' % (result.returncode, (result.stderr or result.stdout).strip()))
        say('自检通过：codegraph %s（%s）' % (result.stdout.strip(), ' '.join(command)))
        return 0
    except Failure as failure:
        print('%s 自检失败：%s' % (PREFIX, failure), file=sys.stderr, flush=True)
        return 1


def main(argv):
    if argv == ['--check']:
        return self_check()
    try:
        repo, index, member, git = read_input(argv)
        if member is not None:
            say('子仓 %s（第 %d/%d 个），集合根目录 %s' % (member['name'], member['index'], member['total'], member['root']))
        if git is not None:
            previous = git['previous']
            say('代码版本：分支 %s，提交 %s；上次成功的构建或更新：%s' % (git['branch'], git['commit'][:12], previous['commit'][:12] if previous else '无记录'))
        check_environment()
        check_repository(repo, index)
        command = codegraph_command()
        state = index_state(index)
        synced = False
        if state == 'init':
            if os.environ.get('CODEGRAPH_NO_WATCH') == '1':
                raise Failure('CODEGRAPH_NO_WATCH=1 会让 init 安装 Git hooks 回退；首版不初始化。请从 iCode Knowledge 后端的启动环境中取消该变量后重试。')
            run_native(command, ['init', repo, '--yes'], repo)
        else:
            details = check_identity(read_status(command, repo), repo, index)
            if details.get('state') != 'complete':
                raise Failure('已有索引状态为 %r，不会自动重建或调用 index。%s' % (details.get('state'), RECOVERY_HINT))
            run_native(command, ['sync', repo], repo)
            synced = True
        if index_state(index) != 'existing':
            raise Failure('codegraph 退出 0，但本仓 %s 中没有 codegraph.db。' % index)
        verify(read_status(command, repo), repo, index, synced)
        say('完成：%s 的索引已校验通过（%s）。' % (repo, 'sync' if synced else 'init'))
        return 0
    except Failure as failure:
        print('%s 失败：%s' % (PREFIX, failure), file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

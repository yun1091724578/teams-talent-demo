import {createHash} from 'node:crypto';
import snapshot from './fixtures/carddemo-source-snapshot.json' with {type:'json'};

/** Historical byte identity belongs to the published manifest, never to today's business checkout. */
export function historicalSourceBytes(source:{path:string;sha256:string;commit?:string}) {
  const matches=snapshot.files.filter(file=>file.path===source.path&&file.sha256===source.sha256&&(!source.commit||file.commit===source.commit));
  if(matches.length!==1)throw new Error('历史源码样本缺失或重复：'+source.path);
  const bytes=Buffer.from(matches[0].content,'utf8');
  if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw new Error('历史源码样本 SHA256 不一致：'+source.path);
  return bytes;
}

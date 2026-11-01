/**
 * Every image fades in as it arrives, whichever component drew it (spec 14):
 * no picture pops onto the page. Run before the first image is parsed, since
 * one may arrive before React does. `data-images` on <html> turns on the rule
 * in `globals.css` that keeps an image back until it has `data-loaded`, so with
 * no script nothing is held back.
 *
 * - An image that has arrived and been decoded gets `data-loaded=""`, and fades.
 * - One the browser already has gets `data-loaded="at-once"`, and is simply
 *   there: a cover back on screen after a change of view does not fade again.
 * - One that failed is let go of too, so its alt text can be read.
 * - One given another file is held back until that file arrives.
 *
 * It must never throw.
 */
export const imageScript = `try{(function(){
var d=document,r=d.documentElement,K='data-loaded';
function known(i){if(!i.hasAttribute(K)&&i.complete&&i.naturalWidth>0)i.setAttribute(K,'at-once')}
function arrived(e){var i=e.target;if(!i||i.tagName!=='IMG'||i.hasAttribute(K))return;
var show=function(){i.setAttribute(K,'')};
if(e.type==='load'&&i.decode)i.decode().then(show,show);else show()}
d.addEventListener('load',arrived,true);
d.addEventListener('error',arrived,true);
new MutationObserver(function(l){for(var n=0;n<l.length;n++){var c=l[n],t=c.target;
if(c.type==='attributes'){if(t.tagName==='IMG'&&t.getAttribute(c.attributeName)!==c.oldValue){t.removeAttribute(K);known(t)}continue}
for(var j=0;j<c.addedNodes.length;j++){var a=c.addedNodes[j];
if(a.tagName==='IMG')known(a);else if(a.getElementsByTagName){var q=a.getElementsByTagName('img');for(var k=0;k<q.length;k++)known(q[k])}}
}}).observe(r,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset'],attributeOldValue:true});
r.setAttribute('data-images','fade')
})()}catch(e){}`

/**
 * Render it in <head>, from a server component only. Not under `pnpm dev`, where
 * React reports the mark on an image that arrived before it did as a mismatch:
 * there images simply appear. A production build reports nothing and leaves the
 * mark alone.
 */
export function ImageScript() {
  if (process.env.NODE_ENV === 'development') return null
  return <script dangerouslySetInnerHTML={{ __html: imageScript }} />
}

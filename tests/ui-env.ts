import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000' });
for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLAnchorElement','Event','KeyboardEvent','MouseEvent','MutationObserver','localStorage']) {
  Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name as keyof typeof dom.window]});
}
Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:dom.window.getComputedStyle.bind(dom.window)});
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => false;

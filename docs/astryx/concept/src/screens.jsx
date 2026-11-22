import {M as M1} from './s1.jsx';
const mods=import.meta.glob(['./s2a.jsx','./s2b.jsx','./s3a.jsx','./s3b.jsx'],{eager:true});
export const M=[...M1,...Object.values(mods).flatMap(m=>m.M||[])];
const S={};M.forEach(m=>S[m.id]=m.C);export default S;

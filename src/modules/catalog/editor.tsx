'use client';
import { useId } from 'react';
import { ReliableCommandForm } from '@/components/reliable-command-form';
import { masterCommand } from './command';
import { saveCatalogWithOutcomeAction } from './actions';
import { catalogChoiceLabel } from './presentation';
import { catalogs } from './fields';
import { catalogHref } from './ownership';
export type Options=Record<string,{id:string;name:string;assignable?:boolean}[]>;
export function CatalogEditor({kind,record,options,permissions,initial,operationId,scope}:{kind:string;record?:Record<string,unknown>;options:Options;permissions?:readonly string[];initial?:Record<string,string>;operationId:string;scope:string}) {
 const id=useId();
 const config=catalogs[kind]; const fields=(kind==='conversions'&&record?config.fields.filter(f=>f.key==='active'):config.fields).filter(f=>!f.permission||permissions?.includes(f.permission));
 return <ReliableCommandForm action={saveCatalogWithOutcomeAction} command={masterCommand(kind)} scope={scope} operationId={operationId} className="card card-pad" resultHref={id=>catalogHref(kind,{id})}><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={String(record?.id??'')}/><input type="hidden" name="editing" value={String(!!record)}/><input type="hidden" name="original" value={JSON.stringify(record??null)}/><div className="form-grid">{fields.map(f=>{const value=record?record[f.key]:initial?.[f.key]??f.value; const opts:Options[string]|undefined=f.options?options[f.options]:f.choices?.map(v=>({id:v,name:catalogChoiceLabel(v)})); const fieldId=`${id}-${f.key}`;return <div className="field" key={f.key}><label htmlFor={fieldId}>{f.label}{f.required?' *':''}</label>{f.type==='checkbox'?<input id={fieldId} name={f.key} type="checkbox" defaultChecked={Boolean(value)}/>:opts?<select id={fieldId} name={f.key} defaultValue={String(value??'')} required={f.required}><option value="">Chọn...</option>{opts.map(o=><option key={o.id} value={o.id} disabled={o.assignable===false&&String(value??'')!==o.id}>{o.name}</option>)}</select>:<input id={fieldId} name={f.key} type={f.type??'text'} step={f.type==='number'&&['latitude','longitude'].includes(f.key)?'any':undefined} min={f.key==='credit_limit_vnd'?'0':undefined} defaultValue={String(value??'')} required={f.required} maxLength={500}/>}</div>})}<div className="field"><label htmlFor={`${id}-reason`}>Lý do thay đổi *</label><input id={`${id}-reason`} name="reason" required minLength={3} maxLength={500}/></div></div>{kind==='conversions'&&<p className="muted">Tỷ lệ đã lưu không sửa trực tiếp: ngừng sử dụng bản cũ và tạo bản mới. Thông tin trên chứng từ cũ được giữ nguyên.</p>}<button type="submit" className="button button-primary">Lưu thay đổi</button></ReliableCommandForm>;
}

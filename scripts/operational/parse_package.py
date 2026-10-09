"""Canonical A-O CSV/XLSX parser. Stdlib only; no database or network access."""
import argparse
import csv
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL="{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
FIELDS=json.loads(Path(__file__).with_name("input_fields.json").read_text())
NUMBERS={"quantity","base_quantity","unit_cost_vnd_per_base","ordered_quantity","accepted_quantity",
 "received_quantity","remaining_quantity","transit_quantity","conversion_numerator","conversion_denominator",
 "decimal_scale","payment_terms_days"}
DATES={"source_date","due_date","period_start","period_end"}

def fail(path,row,key,reason):
    raise ValueError(f"{path}:{row}:{key}: {reason}")

def typed(section,rows,label):
    result=[]
    for n,row in enumerate(rows,6):
        if all(v is None or v=="" for v in row.values()):continue
        out={}
        for key,f in FIELDS[section].items():
            v=row.get(key)
            if isinstance(v,str):v=v.strip()
            if v is None or v=="":
                if f["required"]=="REQUIRED":fail(label,n,key,"required")
                out[key]=None;continue
            if key in ("active","sale_enabled","purchase_enabled"):
                if str(v).lower() not in ("true","false"):fail(label,n,key,"boolean_required")
                out[key]=str(v).lower()=="true";continue
            v=str(v)
            if "[A-Z0-9_-]" in f["rule"]:v=v.upper()
            if key.endswith("uom_code"):v=v.lower()
            if key in DATES:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",v):fail(label,n,key,"date_format")
                try:date.fromisoformat(v)
                except ValueError:fail(label,n,key,"invalid_calendar_date")
            if key in NUMBERS or f["unit"]=="VND":
                try:
                    d=Decimal(v)
                    if not d.is_finite():fail(label,n,key,"finite_decimal_required")
                    if not re.fullmatch(r"-?\d+(?:\.\d+)?",v):fail(label,n,key,"canonical_decimal_required")
                    if f["unit"]=="VND" and not re.fullmatch(r"-?\d+",v):fail(label,n,key,"integer_VND_required")
                except InvalidOperation:fail(label,n,key,"invalid_decimal")
            out[key]=v
        result.append(out)
    return result

def parse(input_path,envelope_path):
    p=Path(input_path);envelope=json.loads(Path(envelope_path).read_text());tables={};hashes=[]
    if p.is_dir():
        for section,fields in FIELDS.items():
            matches=sorted(p.glob(f"SYNTHETIC_{section}_*.csv"))+sorted(p.glob(f"{section}_*.csv"))
            if len(matches)!=1:raise ValueError(f"{section}: exactly one canonical CSV required")
            f=matches[0];hashes.append({"path":f.name,"sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
            with f.open(encoding="utf-8-sig",newline="") as src:
                reader=csv.DictReader(src)
                if reader.fieldnames!=list(fields):raise ValueError(f"{f.name}: canonical header/order mismatch")
                rows=list(reader)
                if any(None in r for r in rows):raise ValueError(f"{f.name}: extra CSV fields")
            tables[section]=typed(section,rows,f.name)
        format_name="CANONICAL_CSV_A_O"
    else:
        hashes.append({"path":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
        with zipfile.ZipFile(p) as z:
            wb=ET.fromstring(z.read("xl/workbook.xml"));props=wb.find("m:workbookPr",NS)
            if props is not None and props.get("date1904") in ("1","true"):raise ValueError("date1904 unsupported: supply ISO date text or CSV")
            rels={x.get("Id"):x.get("Target") for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
            shared=["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))] if "xl/sharedStrings.xml" in z.namelist() else []
            for sheet in wb.find("m:sheets",NS):
                name=sheet.get("name");section=name.split("_")[0]
                if section not in FIELDS:continue
                target=rels[sheet.get(REL)]
                xml=ET.fromstring(z.read(target.lstrip("/") if target.startswith("/") else "xl/"+target))
                cells={}
                for c in xml.findall(".//m:sheetData/m:row/m:c",NS):
                    ref=c.get("r");rn=int(re.search(r"\d+",ref)[0]);col=re.match(r"[A-Z]+",ref)[0]
                    if c.find("m:f",NS) is not None and rn>=6:raise ValueError(f"{name}!{ref}: source formulas forbidden")
                    typ=c.get("t");v=c.find("m:v",NS);value=v.text if v is not None else None
                    if typ=="s":value=shared[int(value)]
                    elif typ=="inlineStr":value="".join(c.find("m:is",NS).itertext())
                    elif typ=="b":value=value=="1"
                    cells[rn,col]=(value,typ)
                cols={c:v for (r,c),(v,_) in cells.items() if r==5 and v is not None}
                if set(cols.values())!=set(FIELDS[section]):raise ValueError(f"{name}: canonical header mismatch")
                rows=[]
                for rn in sorted({r for r,c in cells if r>=6}):
                    record={}
                    for col,key in cols.items():
                        value,typ=cells.get((rn,col),(None,None))
                        if value is not None and typ in (None,"n"):
                            if key in DATES:
                                serial=Decimal(value)
                                if serial!=serial.to_integral_value():fail(name,rn,key,"date must be whole day")
                                value=(date(1899,12,30)+timedelta(days=int(serial))).isoformat()
                            elif len(Decimal(value).as_tuple().digits)>15:fail(name,rn,key,"Excel numeric precision unsafe")
                        record[key]=value
                    rows.append(record)
                tables[section]=typed(section,rows,name)
        if set(tables)!=set(FIELDS):raise ValueError("Missing A-O sheet")
        format_name="CANONICAL_XLSX_A_O"
    for name in ("meta","provenance","source_controls"):
        if name not in envelope:raise ValueError(f"explicit {name} envelope required")
    combined={"files":hashes,"envelope":{k:envelope[k] for k in ("meta","provenance","source_controls")}}
    sha=hashlib.sha256(json.dumps(combined,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return {**combined["envelope"],"tables":tables,"source_sha256":sha,"format":format_name,
            "source_files":hashes,"source_rows":sum(map(len,tables.values()))}

if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("--input",required=True);ap.add_argument("--envelope",required=True)
    args=ap.parse_args()
    print(json.dumps(parse(args.input,args.envelope),ensure_ascii=False,allow_nan=False))

import { createWorker, type Worker } from "tesseract.js";
import { COLUMN_RANGES, normalizeParsedCard } from "./core";
import type { CardImageParser, Cell, ParseResult, ParsedCard } from "./types";

const numberTokens=(text:string)=>(text.match(/\b(?:[1-9]|[1-6]\d|7[0-5])\b/g)||[]).map(Number);
const expectedColumn=(position:number)=>position<12?position%5:(position+1)%5;
const windowScore=(numbers:number[],start:number)=>{
  let valid=0;
  for(let i=0;i<24;i++){const col=expectedColumn(i), value=numbers[start+i];const [min,max]=COLUMN_RANGES[col];if(value>=min&&value<=max)valid++;}
  return valid/24;
};
export function extractCardsFromText(text:string):ParsedCard[]{
  const numbers=numberTokens(text), ranked:Array<{start:number;score:number}>=[];
  for(let start=0;start+24<=numbers.length;start++)ranked.push({start,score:windowScore(numbers,start)});
  ranked.sort((a,b)=>b.score-a.score);
  const chosen:Array<{start:number;score:number}>=[];
  for(const candidate of ranked){if(candidate.score<.7)break;if(chosen.every(card=>Math.abs(card.start-candidate.start)>=20)){chosen.push(candidate);if(chosen.length===4)break;}}
  return chosen.sort((a,b)=>a.start-b.start).map(({start,score})=>{let p=start;const rows=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>r===2&&c===2?null:numbers[p++])) as Cell[][];return normalizeParsedCard({id:crypto.randomUUID(),rows,confidence:score});}).filter(card=>card.confidence>=.68);
}
async function cropQuadrants(file:File):Promise<Blob[]>{
  const bitmap=await createImageBitmap(file), canvas=document.createElement("canvas"), ctx=canvas.getContext("2d")!;
  const parts:Blob[]=[];
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
    const sx=Math.floor(col*bitmap.width/2),sy=Math.floor(row*bitmap.height/2),sw=Math.ceil(bitmap.width/2),sh=Math.ceil(bitmap.height/2);
    canvas.width=Math.min(1400,sw);canvas.height=Math.round(canvas.width*sh/sw);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    parts.push(await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("No se pudo recortar la imagen")),"image/jpeg",.9)));
  }
  bitmap.close();return parts;
}
async function recognize(worker:Worker,image:File|Blob){const result=await worker.recognize(image);return extractCardsFromText(result.data.text);}
export class BrowserCardImageParser implements CardImageParser {
  async parse(file:File,onProgress?:(n:number)=>void):Promise<ParseResult>{
    const worker=await createWorker("eng",1,{logger:m=>{if(m.status==="recognizing text")onProgress?.(Math.round((m.progress||0)*100));}});
    try{
      await worker.setParameters({tessedit_char_whitelist:"0123456789 BINGO",preserve_interword_spaces:"1",user_defined_dpi:"300"});
      let cards=await recognize(worker,file);
      if(cards.length<2){const cropped=await cropQuadrants(file);const regional:ParsedCard[]=[];for(let i=0;i<cropped.length;i++){onProgress?.(25+i*18);regional.push(...await recognize(worker,cropped[i]));}if(regional.length>cards.length)cards=regional.slice(0,4);}
      return {sourceImageId:crypto.randomUUID(),cards,warnings:cards.length?[`Se detectaron ${cards.length} cartón${cards.length===1?"":"es"}. Revísalos antes de confirmar.`]:["No se detectó una cuadrícula fiable. Prueba con la imagen recortada y de frente, o crea el cartón manualmente."]};
    }finally{await worker.terminate();}
  }
}

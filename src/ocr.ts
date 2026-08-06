import { createWorker } from "tesseract.js";
import { normalizeParsedCard } from "./core";
import type { CardImageParser, ParseResult, ParsedCard } from "./types";

function candidates(text:string):ParsedCard[]{
  const numbers=(text.match(/\b(?:[1-9]|[1-6]\d|7[0-5])\b/g)||[]).map(Number);
  const cards:ParsedCard[]=[];
  for(let start=0;start+24<=numbers.length;start+=24){let p=start;const rows=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>r===2&&c===2?null:numbers[p++]));cards.push(normalizeParsedCard({id:crypto.randomUUID(),rows,confidence:.75}));}
  return cards.filter(card=>card.confidence>=.55);
}
export class BrowserCardImageParser implements CardImageParser {
  async parse(file:File,onProgress?:(n:number)=>void):Promise<ParseResult>{
    const worker=await createWorker("eng",1,{logger:m=>{if(m.status==="recognizing text")onProgress?.(Math.round((m.progress||0)*100));}});
    try{await worker.setParameters({tessedit_char_whitelist:"0123456789 BINGO",preserve_interword_spaces:"1"});const result=await worker.recognize(file);const cards=candidates(result.data.text);return {sourceImageId:crypto.randomUUID(),cards,warnings:cards.length?[]:["No se detectó una cuadrícula fiable. Puedes crear el cartón manualmente."]};}finally{await worker.terminate();}
  }
}

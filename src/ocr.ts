import { createWorker, PSM, type Worker } from "tesseract.js";
import { COLUMN_RANGES, normalizeParsedCard } from "./core";
import type { CardImageParser, Cell, ParseResult, ParsedCard } from "./types";

const numberTokens=(text:string)=>(text.match(/\b(?:[1-9]|[1-6]\d|7[0-5])\b/g)||[]).map(Number);
export const extractTableNumber=(text:string)=>{const match=text.toUpperCase().replace(/\s+/g," ").match(/TA[B8]LA\s*[:\-]?\s*(\d{1,4})/);return match?Number(match[1]):undefined;};
const expectedColumn=(position:number)=>position<12?position%5:(position+1)%5;
const decodeDigits=(digits:string,columns:number[],at=0,index=0,values:number[]=[]):number[]|null=>{if(index===columns.length)return at===digits.length?values:null;for(const size of [1,2]){if(at+size>digits.length)continue;const value=Number(digits.slice(at,at+size)),[min,max]=COLUMN_RANGES[columns[index]];if(value>=min&&value<=max){const result=decodeDigits(digits,columns,at+size,index+1,[...values,value]);if(result)return result;}}return null;};
const extractByRows=(text:string):ParsedCard[]=>{const lines=text.split(/\r?\n/).map(line=>line.replace(/\D/g,"")).filter(Boolean),cards:ParsedCard[]=[];for(let start=0;start+4<lines.length;start++){const decoded=lines.slice(start,start+5).map((line,row)=>decodeDigits(line,row===2?[0,1,3,4]:[0,1,2,3,4]));if(decoded.every(Boolean)){const rows=decoded.map((values,row)=>row===2?[values![0],values![1],null,values![2],values![3]]:values!) as Cell[][];cards.push(normalizeParsedCard({id:crypto.randomUUID(),rows,confidence:.96}));start+=4;}}return cards;};
const windowScore=(numbers:number[],start:number)=>{
  let valid=0;
  for(let i=0;i<24;i++){const col=expectedColumn(i), value=numbers[start+i];const [min,max]=COLUMN_RANGES[col];if(value>=min&&value<=max)valid++;}
  return valid/24;
};
export function extractCardsFromText(text:string):ParsedCard[]{
  const rowCards=extractByRows(text);if(rowCards.length)return rowCards;
  const numbers=numberTokens(text), ranked:Array<{start:number;score:number}>=[];
  for(let start=0;start+24<=numbers.length;start++)ranked.push({start,score:windowScore(numbers,start)});
  ranked.sort((a,b)=>b.score-a.score);
  const chosen:Array<{start:number;score:number}>=[];
  for(const candidate of ranked){if(candidate.score<.7)break;if(chosen.every(card=>Math.abs(card.start-candidate.start)>=20)){chosen.push(candidate);if(chosen.length===4)break;}}
  return chosen.sort((a,b)=>a.start-b.start).map(({start,score})=>{let p=start;const rows=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>r===2&&c===2?null:numbers[p++])) as Cell[][];return normalizeParsedCard({id:crypto.randomUUID(),rows,confidence:score});}).filter(card=>card.confidence>=.68);
}
type GridBox={x0:number;y0:number;x1:number;y1:number};
const groups=(values:number[])=>{const result:number[][]=[];for(const value of values){const last=result.at(-1);if(last&&value-last.at(-1)!<=2)last.push(value);else result.push([value]);}return result.map(group=>Math.round(group.reduce((a,b)=>a+b,0)/group.length));};
const regularSix=(lines:number[],minGap:number,maxGap:number)=>{const sets:number[][]=[];for(let start=0;start+5<lines.length;start++){const six=lines.slice(start,start+6),gaps=six.slice(1).map((v,i)=>v-six[i]),mean=gaps.reduce((a,b)=>a+b,0)/5;if(mean>=minGap&&mean<=maxGap&&gaps.every(g=>Math.abs(g-mean)<=Math.max(3,mean*.14)))sets.push(six);}return sets;};
export function findGridBoxesFromPixels(data:Uint8ClampedArray,width:number,height:number):GridBox[]{
  const dark=(x:number,y:number)=>{const i=(y*width+x)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114<155;};
  const horizontal:number[]=[];for(let y=0;y<height;y++){let run=0,longest=0;for(let x=0;x<width;x++){run=dark(x,y)?run+1:0;longest=Math.max(longest,run);}if(longest>width*.2)horizontal.push(y);}
  const ySets=regularSix(groups(horizontal),Math.max(15,height*.018),height*.2),boxes:GridBox[]=[];
  for(const ys of ySets){const y0=ys[0],y1=ys[5],vertical:number[]=[];for(let x=0;x<width;x++){let run=0,longest=0;for(let y=y0;y<=y1;y++){run=dark(x,y)?run+1:0;longest=Math.max(longest,run);}if(longest>(y1-y0)*.45)vertical.push(x);}for(const xs of regularSix(groups(vertical),Math.max(15,width*.035),width*.18)){const box={x0:xs[0],y0,x1:xs[5],y1};if(boxes.every(b=>Math.abs(b.x0-box.x0)>8||Math.abs(b.y0-box.y0)>8))boxes.push(box);}}
  return boxes.sort((a,b)=>a.y0-b.y0||a.x0-b.x0).slice(0,8);
}
const canvasBlob=(canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("No se pudo preparar la imagen")),"image/png"));
async function isolateCardGrids(file:File):Promise<Blob[]>{
  const bitmap=await createImageBitmap(file),source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true})!;source.width=bitmap.width;source.height=bitmap.height;ctx.drawImage(bitmap,0,0);const boxes=findGridBoxesFromPixels(ctx.getImageData(0,0,source.width,source.height).data,source.width,source.height),parts:Blob[]=[];
  for(const box of boxes){const out=document.createElement("canvas"),outCtx=out.getContext("2d")!;out.width=580;out.height=580;outCtx.fillStyle="white";outCtx.fillRect(0,0,out.width,out.height);const cellW=(box.x1-box.x0)/5,cellH=(box.y1-box.y0)/5;
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){if(r===2&&c===2)continue;const sx=box.x0+c*cellW+cellW*.1,sy=box.y0+r*cellH+cellH*.08,sw=cellW*.8,sh=cellH*.84;outCtx.drawImage(bitmap,sx,sy,sw,sh,c*116+12,r*116+10,92,96);}
    parts.push(await canvasBlob(out));
  }
  bitmap.close();return parts;
}
async function isolateTableLabel(file:File):Promise<Blob|null>{
  const bitmap=await createImageBitmap(file),source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true})!;source.width=bitmap.width;source.height=bitmap.height;ctx.drawImage(bitmap,0,0);const boxes=findGridBoxesFromPixels(ctx.getImageData(0,0,source.width,source.height).data,source.width,source.height);if(!boxes.length){bitmap.close();return null;}const firstY=Math.min(...boxes.map(box=>box.y0)),top=Math.max(0,firstY-Math.round(source.height*.105)),height=Math.max(42,Math.round(source.height*.06)),out=document.createElement("canvas"),outCtx=out.getContext("2d")!;out.width=Math.min(1600,source.width*2.5);out.height=Math.round(out.width*height/source.width);outCtx.filter="contrast(1.8) grayscale(1)";outCtx.drawImage(bitmap,0,top,source.width,height,0,0,out.width,out.height);bitmap.close();return canvasBlob(out);
}
async function recognize(worker:Worker,image:File|Blob){const result=await worker.recognize(image);return extractCardsFromText(result.data.text);}
export class BrowserCardImageParser implements CardImageParser {
  async parse(file:File,onProgress?:(n:number)=>void):Promise<ParseResult>{
    const worker=await createWorker("eng",1,{logger:m=>{if(m.status==="recognizing text")onProgress?.(Math.round((m.progress||0)*100));}});
    try{
      await worker.setParameters({tessedit_char_whitelist:"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ :-",preserve_interword_spaces:"1",user_defined_dpi:"300"});
      const fullResult=await worker.recognize(file);let tableNumber=extractTableNumber(fullResult.data.text);
      if(!tableNumber){const tableLabel=await isolateTableLabel(file);if(tableLabel){await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:"0123456789"});const labelResult=await worker.recognize(tableLabel),labelText=labelResult.data.text;tableNumber=Number(labelText.match(/\b([1-9]\d{2,3})\b/)?.[1])||undefined;}}
      let cards:ParsedCard[]=extractCardsFromText(fullResult.data.text).map(card=>({...card,tableNumber}));
      const grids=await isolateCardGrids(file);
      if(grids.length){await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,tessedit_char_whitelist:"0123456789 BINGO"});const spatial:ParsedCard[]=[];for(let i=0;i<grids.length;i++){onProgress?.(20+Math.round(i/Math.max(grids.length,1)*75));spatial.push(...(await recognize(worker,grids[i])).map(card=>({...card,tableNumber})));}if(spatial.length>cards.length)cards=spatial.slice(0,4);}
      return {sourceImageId:crypto.randomUUID(),cards,tableNumber,warnings:cards.length?[`Se detectaron ${cards.length} cartón${cards.length===1?"":"es"}${tableNumber?` de la Tabla ${tableNumber}`:""}. Revísalos antes de confirmar.`]:["No se detectó una cuadrícula fiable. Prueba con la imagen recortada y de frente, o crea el cartón manualmente."]};
    }finally{await worker.terminate();}
  }
}

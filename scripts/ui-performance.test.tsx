import { Profiler, createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import App from "../src/App";
import { addressSuggestions } from "../src/addressSuggestions";
import { emptySnapshot } from "../src/bridge";
const counters = vi.hoisted(() => ({tabGlyphRenders:0}));
const state = {...structuredClone(emptySnapshot), tabs:Array.from({length:80}, (_,i)=>({id:`tab-${i}`,title:`Page ${i}`,url:`https://page${i}.test/`})), activeTabId:"tab-0",
  history:Array.from({length:5000},(_,i)=>({id:i,title:`Page ${i}`,url:`https://page${i}.test/article`})), bookmarks:[]};
vi.mock("../src/bridge", async original => ({...await original<typeof import("../src/bridge")>(), native:()=>true, command:vi.fn(async name => name === "app_snapshot" ? state : undefined)}));
vi.mock("@tauri-apps/api/event",()=>({listen:vi.fn(async()=>()=>{})}));
vi.mock("../src/icons",async original=>{
 const icons=await original<typeof import("../src/icons")>();
 return {...icons,Globe2:(props:React.ComponentProps<typeof icons.Globe2>)=>{if(props.size===14)counters.tabGlyphRenders++;return createElement(icons.Globe2,props);}};
});
const median = (values:number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
it.skipIf(!process.env.LABEEB_PERF_OUT)("records repeatable shell CPU measurements (not browser paint or INP)",async()=>{
 vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});
 const queries=Array.from({length:24},(_,i)=>`page${i}`);
 const search:number[]=[];
 // Warm up before measuring repeated queries against unchanged library references.
 queries.forEach(q=>addressSuggestions(q,state.history,state.bookmarks));
 for(let run=0;run<7;run++) {const start=performance.now();queries.forEach(q=>addressSuggestions(q,state.history,state.bookmarks));search.push(performance.now()-start);}
 const renders:number[]=[],cpu:number[]=[],elapsed:number[]=[];
 for(let run=0;run<6;run++) {
  localStorage.clear();let committed=0;
  render(<Profiler id="shell" onRender={(_id,phase,duration)=>{if(phase!=="mount")committed+=duration;}}><App/></Profiler>);
  await waitFor(()=>{if(screen.getAllByRole("tab").length!==80)throw Error("waiting");});
  const input=screen.getByRole("combobox");
  committed=0;counters.tabGlyphRenders=0;
  const start=performance.now();
  queries.forEach(q=>fireEvent.change(input,{target:{value:q}}));
  if(run>0){elapsed.push(performance.now()-start);cpu.push(committed);renders.push(counters.tabGlyphRenders);}
  cleanup();
 }
 writeFileSync(process.env.LABEEB_PERF_OUT!,JSON.stringify({environment:{node:process.version,platform:process.platform,cpu:cpus()[0].model,engine:"Vitest/jsdom, React development build; IPC mocked; no browser layout/paint"},scenario:{tabs:80,history:5000,inputChanges:24,measuredShellRuns:5,searchRuns:7},searchBatchMs:search,searchMedianMs:median(search),shellElapsedMs:elapsed,shellMedianMs:median(elapsed),reactCommitMs:cpu,reactMedianMs:median(cpu),tabGlyphRenders:renders},null,2));
 vi.unstubAllGlobals();
},120000);

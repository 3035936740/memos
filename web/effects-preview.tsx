import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./src/index.css";
import darkCSS from "./src/themes/default-dark.css?raw";
import desertCSS from "./src/themes/desert-sand.css?raw";
import WalkingCat from "./src/components/StyledBlog/WalkingCat";
import RainyGlass from "./src/components/StyledBlog/RainyGlass";
import ReactionCanvas from "./src/components/StyledBlog/ReactionCanvas";
import CosmicBackground from "./src/components/CosmicBackground";
import SettingSection from "./src/components/Settings/SettingSection";
import { SettingList, SettingListItem, SettingPanel } from "./src/components/Settings/SettingList";
import { Button } from "./src/components/ui/button";
import { Input } from "./src/components/ui/input";
import { Textarea } from "./src/components/ui/textarea";
import { Switch } from "./src/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./src/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./src/components/ui/dialog";

const energy = () => 0;
const PerformanceMeter = ({ mode }: { mode: string }) => {
  const output = useRef<HTMLOutputElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const warmup = performance.now() + 2000;
    const samples: number[] = [];
    let last = 0;
    let lastReport = warmup;
    let frame = 0;
    let longTasks = 0;
    let longest = 0;
    let canvasDraws = 0;
    let previousDraws = 0;
    const originalClear = CanvasRenderingContext2D.prototype.clearRect;
    const countedClear: typeof originalClear = function(this: CanvasRenderingContext2D,...args) { canvasDraws++; return originalClear.apply(this, args); };
    if (mode === "performance") CanvasRenderingContext2D.prototype.clearRect = countedClear;
    if (output.current) output.current.textContent = "性能采样预热中…";
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime < warmup) continue;
        longTasks++;
        longest = Math.max(longest, entry.duration);
      }
    });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) observer.observe({ type: "longtask" });
    const tick = (now: number) => {
      if (now >= warmup && last >= warmup) samples.push(now - last);
      last = now;
      if (now - lastReport >= 1000 && samples.length) {
        const recent = samples.slice(-1800).sort((a, b) => a - b);
        const p95 = recent[Math.floor((recent.length - 1) * 0.95)];
        const pixels = [...document.querySelectorAll("canvas")].reduce((total,canvas)=>total+canvas.width*canvas.height,0);
        const draws = (canvasDraws-previousDraws)/((now-lastReport)/1000);
        if (output.current) output.current.textContent = `${((now-warmup)/1000).toFixed(0)}s · RAF p95 ${p95.toFixed(1)}ms · >50ms 长任务 ${longTasks} · 最长 ${longest.toFixed(0)}ms${mode === "performance" ? ` · Canvas ${draws.toFixed(0)} draws/s · ${(pixels/1e6).toFixed(2)} MP` : ""}`;
        previousDraws = canvasDraws;
        lastReport = now;
      }
      if (samples.length > 3600) samples.splice(0, 1800);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {cancelAnimationFrame(frame); observer.disconnect(); if(CanvasRenderingContext2D.prototype.clearRect===countedClear) CanvasRenderingContext2D.prototype.clearRect=originalClear;};
  }, [mode, run]);
  return <div data-rain-performance="" style={{position:"fixed", bottom:8, left:8, zIndex:110, padding:8, background:"#f8f7f0", color:"#222", fontSize:12}}><output ref={output} /><button style={{marginLeft:8}} onClick={()=>setRun(value=>value+1)}>重置性能采样</button></div>;
};
const Preview = () => {
  const [mode, setMode] = useState(() => sessionStorage.getItem("memos-effects-preview-mode") || "rain");
  const [style, setStyle] = useState(() => sessionStorage.getItem("memos-effects-preview-style") || "default");
  const [dark, setDark] = useState(() => sessionStorage.getItem("memos-effects-preview-dark") === "true");
  useEffect(() => {
    sessionStorage.setItem("memos-effects-preview-mode",mode);
    sessionStorage.setItem("memos-effects-preview-style",style);
    sessionStorage.setItem("memos-effects-preview-dark",String(dark));
    document.documentElement.dataset.style = style;
    document.documentElement.dataset.theme = dark ? "default-dark" : mode === "ember" ? "desert-sand" : "default";
    if(mode === "performance") {document.documentElement.dataset.theme = "ocean-breeze"; document.documentElement.dataset.particles="1";}
    else delete document.documentElement.dataset.particles;
    document.documentElement.classList.toggle("dark", dark);
  }, [mode, style, dark]);
  return <>
    {(mode === "rain" || mode === "performance") && <PerformanceMeter mode={mode} />}
    {dark && <style>{darkCSS}</style>}
    {!dark && mode === "ember" && <style>{desertCSS}</style>}
    <nav style={{position: "relative", zIndex: 100, display: "flex", flexWrap:"wrap", gap: 12, padding: 16, background: dark ? "#132733" : "#f4f3ec"}}>
      {["cat", "rain", "fish", "meteor", "bat", "bubble", "ember", "leaf", "petal", "candy", "settings", "performance"].map(value => <Button key={value} onClick={() => {setMode(value); if(value === "settings" || value === "fish" || value === "performance") setStyle("aero"); if(value === "ember") setStyle("handdrawn");}}>{value}</Button>)}
      <select aria-label="Style" value={style} onChange={event => setStyle(event.target.value)}>{["default","aero","handdrawn","pixel","terminal"].map(value => <option key={value}>{value}</option>)}</select>
      <label><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)} />Dark</label>
    </nav>
    <main style={{position:"relative", minHeight:"calc(100vh - 64px)", padding:"32px 8%"}}>
      {mode === "performance" && <><CosmicBackground /><ReactionCanvas layer="back" kinds={["fish","bubble","star"]} look="gloss" density={2} getEnergy={energy} /><ReactionCanvas layer="front" kinds={[]} look="gloss" density={1} getEnergy={energy} /><div data-styled-blog="" style={{maxWidth:900,margin:"auto",display:"grid",gap:18}}>{Array.from({length:15},(_,index)=><article key={index} data-sb-card="" style={{padding:24}}><h2>性能检查文章 {index+1}</h2><p style={{marginTop:12}}>这是本地测试数据，用来检查滚动、背景动画与多个玻璃卡片同时出现时的开销。</p></article>)}</div></>}
      {mode === "cat" && <div data-styled-blog="" style={{maxWidth:800, margin:"auto"}}>
        <article data-sb-card="" style={{position:"relative", height:180, padding:24, border:"1px solid #b8b4a5", borderRadius:12}}>
          <h2>猫在卡片底部走过</h2><p>将鼠标放在这张卡片上。</p><WalkingCat />
        </article>
        <div style={{display:"flex", gap:48, alignItems:"center", marginTop:60}}>
          {[1,2,3].map(size => <div data-sb-card="" data-preview-static="" key={size} style={{position:"relative", width:110*size, height:80*size, zoom:size}}><WalkingCat /><style>{`[data-sb-card][data-preview-static] [data-sb-cat] {opacity:1; position:relative; display:block} [data-sb-card] [data-sb-cat] {animation-duration:5s}`}</style></div>)}
        </div>
      </div>}
      {mode === "rain" && <><div style={{maxWidth:800, margin:"auto", padding:30, background:dark ? "#1c2b36" : "#fffaf0", borderRadius:12}}>
        <h1>雨天，在窗前读一篇文章</h1><p>水珠停在玻璃表面，慢慢汇集后向下滑动。</p>
        {Array.from({length:7},(_,i)=><p key={i} style={{marginTop:24,lineHeight:1.9}}>玻璃上有细小水珠和沿着窗面留下的水痕。正文仍然可以阅读、选择和点击。Rain on the window — water beads and slowly moving trails.</p>)}
        <Button onClick={event => {event.currentTarget.textContent="点击正常";}}>点击检查</Button>
      </div><RainyGlass /></>}
      {mode === "fish" && <><h1>水族馆：观察尾鳍和胸鳍</h1><ReactionCanvas layer="front" kinds={["fish"]} look="gloss" density={1} getEnergy={energy} /></>}
      {mode === "meteor" && <><h1>流星：沿同一直线飞行</h1><ReactionCanvas layer="front" kinds={["comet","star"]} look="plain" density={1} getEnergy={energy} /></>}
      {mode === "bat" && <><h1>蝙蝠：整片翼膜扇动</h1><ReactionCanvas layer="front" kinds={["bat"]} look="plain" density={2} getEnergy={energy} /></>}
      {["bubble","ember","leaf","petal","candy"].includes(mode) && <><h1>{mode === "ember" ? "沙漠之沙 · 小圆球" : mode}</h1><ReactionCanvas layer="front" kinds={[mode as "bubble" | "ember" | "leaf" | "petal" | "candy"]} look={style === "pixel" ? "pixel" : style === "terminal" ? "ascii" : mode === "ember" && style === "aero" ? "gloss" : mode === "bubble" || mode === "ember" ? "ink" : "plain"} density={1} getEnergy={energy} /></>}
      {mode === "settings" && <div data-page-panel="" style={{maxWidth:850, margin:"auto"}}><SettingSection title="系统">
        <Dialog><DialogTrigger render={<Button variant="outline" />}>检查设置弹窗</DialogTrigger><DialogContent><DialogTitle>编辑服务器名称</DialogTitle><Input defaultValue="Memos Plus" /><Button>保存</Button><Button variant="outline">取消</Button></DialogContent></Dialog>
        <h4>基础</h4><SettingList><SettingListItem label="服务器名称" description="Memos Plus"><Button variant="outline">编辑</Button></SettingListItem><SettingListItem label="每页备忘录数量"><Input type="number" defaultValue="10" /></SettingListItem><SettingListItem label="默认背景图片"><Input placeholder="https://example.com/background.webp" /></SettingListItem></SettingList>
        <h4>自定义代码</h4><SettingPanel header="自定义样式"><Textarea placeholder="自定义 CSS 代码" /></SettingPanel>
        <h4>访问和策略</h4><SettingList><SettingListItem label="允许公开访问"><Switch defaultChecked /></SettingListItem><SettingListItem label="初次访问默认样式风格"><select><option>开发者</option><option>FA</option></select></SettingListItem><SettingListItem label="禁止用户注册"><Switch /></SettingListItem></SettingList>
        <h4>页面和导航</h4><section className="rounded-lg border bg-card/50 space-y-3 p-4"><p>友链 /pages/friend-link</p><Input defaultValue="友链" /><div className="flex gap-2"><Button variant="outline">标题</Button><Button variant="outline">粗体</Button><Button variant="outline">链接</Button></div><div className="grid grid-cols-2 gap-3"><Textarea defaultValue="## 友情链接" /><div className="rounded-md border bg-background/60 p-4"><h2>友情链接</h2></div></div></section>
        <h4>表情包</h4><SettingPanel header="番茄大家庭" footer={<><Tabs value="file" onValueChange={() => {}}><TabsList className="bg-muted rounded-md p-1"><TabsTrigger value="file">上传文件</TabsTrigger><TabsTrigger value="url">URL</TabsTrigger></TabsList></Tabs><Input placeholder="表情名称" /><Button>添加表情</Button></>}><div className="grid grid-cols-4 gap-2 p-3">{["🐈","🐟","🐱","🐠"].map((emoji,i)=><div key={i} className="rounded-md border p-4 text-center">{emoji}<p>表情</p></div>)}</div></SettingPanel>
      </SettingSection></div>}
    </main>
  </>;
};
const previewRoot = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<Preview />);

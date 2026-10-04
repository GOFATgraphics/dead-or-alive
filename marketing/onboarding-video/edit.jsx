const W=1280,H=720,R="#d92d33",C="#c26a05",G="#138a43",V="#5b3df5",INK="#12132a";
const BG={kind:"linear",angle:135,stops:[{offset:0,color:"#1b1440"},{offset:1,color:"#3a1d5c"}]};
const LIGHT={kind:"linear",angle:135,stops:[{offset:0,color:"#e5e8f6"},{offset:1,color:"#f6e4ef"}]};
const fade=(a=0,d=0.3)=>({property:"opacity",keyframes:[{at:a,value:0},{at:a+d,value:1}]});
const pop=(a)=>[fade(a,0.15),{property:"scale",keyframes:[{at:a,value:0.4},{at:a+0.22,value:1.12,easing:"ease-out"},{at:a+0.36,value:1}]}];
const shake=(a,amt=14)=>[{property:"offsetX",keyframes:[0,1,2,3,4,5,6].map((i)=>({at:a+i*0.04,value:i==6?0:(i%2?-1:1)*amt*(1-i/7)}))},{property:"offsetY",keyframes:[0,1,2,3,4,5,6].map((i)=>({at:a+i*0.04,value:i==6?0:(i%2?1:-1)*amt*0.6*(1-i/7)}))}];
const flash=(a,c="#ffffff")=><rect x={0} y={0} width={W} height={H} fill={c} animate={[{property:"opacity",keyframes:[{at:0,value:0},{at:a,value:0},{at:a+0.04,value:0.75},{at:a+0.3,value:0}]}]}/>;
const T=(s,o)=><text x={o.x} y={o.y} width={o.w||W-160} fontFamily={o.f||"Inter"} fontWeight={o.fw||900} fontSize={o.s||64} color={o.c||"#fff"} letterSpacing={o.ls??-2} align={o.al||"left"} lineHeight={o.lh||1.05} shadow={o.sh} motion={o.m===false?undefined:{by:o.by||"word",at:o.at||0,from:{opacity:0,y:30,scale:0.92},duration:o.md||0.5,easing:"house"}} animate={o.an}>{s}</text>;
function stamp(v,x,y,s,a,rot=-11){const col={DEAD:R,COPE:C,ALIVE:G}[v];const w=s*(v.length*0.78+0.9),h=s*1.5;
 const an=[fade(a,0.08),{property:"scale",keyframes:[{at:a,value:2.6},{at:a+0.16,value:0.94,easing:"ease-out"},{at:a+0.28,value:1}]},{property:"rotation",from:rot,to:rot,duration:0.05}];
 return [<rect x={x-w/2} y={y-h/2} width={w} height={h} radius={s*0.14} fill="#ffffff" strokeColor={col} strokeWidth={s*0.1} animate={an} shadow={{y:10,blur:30,color:"#00000055"}}/>,
 <text x={x-w/2} y={y-h/2} width={w} height={h} align="center" lineHeight={h/s/1.0} fontFamily="JetBrains Mono" fontWeight={700} fontSize={s} letterSpacing={s*0.12} color={col} animate={an}>{v}</text>];}
const chip=(s,x,y,a,col=V)=><text x={x} y={y} width={420} fontFamily="Inter" fontWeight={700} fontSize={30} color="#fff" animate={[...pop(a),{property:"offsetX",keyframes:[{at:a,value:60},{at:a+0.3,value:0,easing:"house"}]}]} shadow={{y:6,blur:18,color:col}}>{"● "+s}</text>;
const shot=(h,o={})=><media file={h} at={o.at} duration={o.dur} x={o.x||0} y={o.y||0} width={o.w||W} height={o.h||H} fit="cover" radius={o.r||0} shadow={o.sh} effects={o.fx} animate={[{property:"scale",from:o.z0||1.02,to:o.z1||1.14,duration:o.d||5,easing:"linear"},...(o.an||[])]}/>;
const scene=(p,at,dur,kids,bg=BG)=>p.compose(<frame width={W} height={H} layout="none" background={bg} motion={{enter:{from:{opacity:0,scale:1.05},duration:0.25}}}>{kids}<rect x={0} y={0} width={W} height={H} fill={{kind:"radial",stops:[{offset:0.55,color:"#000000",opacity:0},{offset:1,color:"#000000",opacity:0.45}]}}/></frame>,{at,dur});
export default async ({ project }) => {
 const p = await project({ dir: ".", size: `${W}x${H}`, fps: 24, background: "#120f24" });
 const c = {}; for (const i of [1,2,3,4,5,6,7,8]) c[i] = await p.add(`c${i}.mp4`);
 scene(p,0,4.4,[shot(c[1],{d:4.4,fx:[{kind:"blur",params:{radius:8}}],an:[...shake(1.52),{property:"opacity",from:0.28,to:0.28,duration:0.1}]}),
  T("Is your page",{x:90,y:150,s:110,at:0.35}),
  ...stamp("DEAD",420,420,96,1.52,-9), T("or",{x:640,y:372,s:80,at:2.4,w:200}),
  ...stamp("ALIVE",990,420,96,3.2,-6), flash(1.52), flash(3.2)]);
 scene(p,4.4,4.6,[shot(c[1],{d:4.6}),
  <rect x={0} y={0} width={W} height={H} fill="#000000" animate={[{property:"opacity",keyframes:[{at:0,value:0},{at:3.1,value:0},{at:3.6,value:0.6}]}]}/>,
  <rect x={0} y={420} width={W} height={300} fill={{kind:"linear",angle:90,stops:[{offset:0,color:"#120f24",opacity:0},{offset:0.6,color:"#120f24",opacity:0.92},{offset:1,color:"#120f24",opacity:0.96}]}}/>,
  T("A stranger gives your",{x:70,y:520,s:44,at:0.0}),
  T("first screen",{x:70,y:572,s:80,at:0.6,c:"#b9a6ff"}),
  T("5 SECONDS",{x:800,y:590,w:440,s:64,f:"JetBrains Mono",fw:700,ls:2,at:1.2,c:"#ff5a60",by:"character",md:0.4}),
  T("…then they're gone.",{x:0,y:310,w:W,s:84,al:"center",at:3.2})]);
 scene(p,9.0,2.9,[<rect x={540} y={130} width={200} height={200} radius={46} fill={{kind:"linear",angle:135,stops:[{offset:0,color:"#9a7dff"},{offset:1,color:"#4b2ee0"}]}} animate={pop(0.05)} shadow={{y:20,blur:60,color:"#7b5cff88"}}/>,
  T("Stamp My Page",{x:0,y:380,w:W,s:100,al:"center",at:0.3,ls:-3}),
  T("tells you what they saw.",{x:0,y:510,w:W,s:46,fw:600,al:"center",c:"#c9bfff",at:1.0}),
  <rect x={-400} y={0} width={260} height={H} fill={{kind:"linear",angle:0,stops:[{offset:0,color:"#ffffff",opacity:0},{offset:0.5,color:"#ffffff",opacity:0.35},{offset:1,color:"#ffffff",opacity:0}]}} animate={[{property:"offsetX",from:0,to:2000,at:0.4,duration:1.2,easing:"ease-in-out"},{property:"rotation",from:12,to:12,duration:0.05}]}/>]);
 scene(p,11.9,7.1,[shot(c[2],{x:60,y:150,w:780,h:488,r:18,d:7.0,dur:7.0,z0:1,z1:1.06,sh:{y:24,blur:60,color:"#00000088"}}),
  T("Paste your link",{x:60,y:50,s:70,at:0.1}),
  chip("Website",900,190,1.95),chip("Web app",900,270,2.75),chip("SaaS",900,350,3.85),chip("App Store page",900,430,5.9,G)],BG);
 scene(p,19.0,1.5,[shot(c[3],{d:1.5,fx:[{kind:"blur",params:{radius:10}},{kind:"brightness",params:{amount:0.5}}]}),
  T("$1",{x:0,y:170,w:W,s:300,al:"center",at:0.1,m:false,an:pop(0.1),c:"#ffffff",sh:{y:20,blur:60,color:V}}),flash(0.1,"#9a7dff")]);
 scene(p,20.5,9.3,[shot(c[4],{d:4.65,dur:4.65,z1:1.08}),shot(c[1],{at:4.65,dur:4.65,d:4.65,z0:1.08,z1:1.16}),
  <rect x={0} y={0} width={W} height={10} fill={{kind:"linear",angle:90,stops:[{offset:0,color:"#9a7dff",opacity:0},{offset:0.5,color:"#b9a6ff"},{offset:1,color:"#9a7dff",opacity:0}]}} shadow={{blur:30,color:"#7b5cff"}} animate={[{property:"offsetY",keyframes:[{at:0,value:0},{at:2.2,value:710,easing:"linear"},{at:4.4,value:0,easing:"linear"}],repeat:2}]}/>,
  T("AI reads it like a stranger",{x:60,y:40,s:52,at:0.1,c:INK,ls:-1.5}),
  T("LOGGED OUT",{x:60,y:560,s:54,f:"JetBrains Mono",fw:700,ls:3,at:3.86,c:V,by:"character",md:0.3}),
  T("NO SCROLLING",{x:470,y:560,s:54,f:"JetBrains Mono",fw:700,ls:3,at:5.34,c:V,by:"character",md:0.3}),
  T("5s",{x:1000,y:520,w:220,s:120,f:"JetBrains Mono",fw:700,at:7.12,c:R,m:false,an:pop(7.12)})]);
 scene(p,29.8,4.1,[shot(c[5],{d:4.1,an:shake(3.1,18)}),
  T("It circles what works…",{x:60,y:40,s:46,at:0.3,c:INK,ls:-1}),T("…and what doesn't.",{x:60,y:96,s:46,at:1.2,c:R,ls:-1}),flash(3.1)]);
 scene(p,33.9,4.3,[<rect x={0} y={0} width={W} height={H} fill={BG}/>,
  ...stamp("DEAD",300,330,84,0.26,-12),...stamp("COPE",640,390,84,1.82,-4),...stamp("ALIVE",990,330,84,3.36,-10),
  T("One word.",{x:0,y:560,w:W,s:56,al:"center",at:0.3,c:"#c9bfff"}),flash(0.26),flash(1.82),flash(3.36)]);
 scene(p,38.2,7.4,[shot(c[6],{x:40,y:150,w:720,h:420,r:16,d:7.0,dur:7.0,z0:1,z1:1.05,sh:{y:24,blur:60,color:"#00000088"}}),
  T("In minutes you get",{x:40,y:50,s:60,at:0.1}),
  chip("✓ The verdict",800,190,0.9),chip("✓ One honest sentence",800,270,2.36),chip("✓ Stack & speed check",800,350,3.8),chip("✓ A card made to post",800,430,6.04,G)]);
 scene(p,45.6,1.4,[shot(c[7],{d:1.4}),T("Share it.",{x:60,y:60,s:110,at:0.0,c:INK,m:false,an:pop(0.05)}),
  chip("𝕏  Post",80,220,0.3,INK),chip("in  Share",80,290,0.45,"#0a66c2")],LIGHT);
 scene(p,47.0,2.6,[shot(c[8],{d:2.6}),T("Fix what's broken.",{x:60,y:40,s:56,at:0.0,c:INK}),
  T("Post the comeback.",{x:60,y:110,s:56,at:1.36,c:G})],LIGHT);
 scene(p,49.6,5.4,[<rect x={540} y={90} width={200} height={200} radius={46} fill={{kind:"linear",angle:135,stops:[{offset:0,color:"#9a7dff"},{offset:1,color:"#4b2ee0"}]}} animate={pop(0)} shadow={{y:20,blur:60,color:"#7b5cff88"}}/>,
  T("stampmypage.com",{x:0,y:320,w:W,s:96,al:"center",at:0.1,ls:-3}),
  T("One page.",{x:140,y:460,w:340,s:50,fw:700,al:"center",c:"#c9bfff",at:1.9}),T("One stamp.",{x:470,y:460,w:340,s:50,fw:700,al:"center",c:"#c9bfff",at:3.1}),T("One dollar.",{x:800,y:460,w:340,s:50,fw:700,al:"center",c:"#ffffff",at:4.2}),
  T("Judge my page — $1",{x:440,y:560,w:400,s:34,fw:700,al:"center",at:2.4,m:false,an:[...pop(2.4),{property:"scale",keyframes:[{at:3.0,value:1},{at:3.5,value:1.06},{at:4.0,value:1}],repeat:2}]})]);
 for (const t of process.env.FRAMES ? process.env.FRAMES.split(",") : []) await p.frame(+t, `fr_${t}.png`);
 if (process.env.RENDER) await p.render("renders/video.mp4");
};

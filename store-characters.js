(() => {
  "use strict";

  const OUTLINE = "#483534";
  const BOOT = "#40363a";
  const SKIN_SHADE = "#ad7458";
  const WICKER = ["#73452d", "#a86d3d", "#db9c53", "#f4c375"];
  const WARDROBE = [
    { name:"young", coat:"#a64c37", lit:"#d47652", legs:"#73653e", dark:"#514630", hair:"#523437", sheen:"#a3604c", skin:"#efb98d", accent:"#f5c267" },
    { name:"olderMan", coat:"#947047", lit:"#bf975e", legs:"#63574c", dark:"#4b423a", hair:"#98918b", sheen:"#e7d7c2", skin:"#ddb086", accent:"#76654d" },
    { name:"olderWoman", coat:"#a7829a", lit:"#d2a9b8", legs:"#724b60", dark:"#533e50", hair:"#a19a9a", sheen:"#e4d8cf", skin:"#f0c39f", accent:"#bb7c8d" },
    { name:"commuter", coat:"#515373", lit:"#777b99", legs:"#494862", dark:"#34384f", hair:"#473943", sheen:"#856466", skin:"#dcad87", accent:"#caa47c" },
    { name:"clerk", coat:"#47796f", lit:"#75a295", legs:"#a45e45", dark:"#78463b", hair:"#514039", sheen:"#956651", skin:"#eac093", accent:"#f5c875" }
  ];
  // Pixel clusters stay sharp at the default map zoom. Each letter is a palette tone.
  const HEADS = {
    young: [
      "....dddd....", "..ddHHhhdd..", ".dHHHHhhhhd.", ".dHhhsshhhd.",
      ".dhhasbllbd.", ".dhhslbblld.", ".dhshbbebed.", ".dhhsbcbnld.",
      "..dhsbbbmbd.", "..ddssbbbd..", "....ddssdd..", "......ss...."
    ],
    olderMan: [
      "....dddd....", "..ddUUuud...", ".dUUuuuuudd.", ".duuUUUUuud.",
      "..dddhhsbbd.", "..dhHsbababd", "..dHhsbeaed.", "..dhHsbcnld.",
      "...dhssHHbd.", "...ddsbmbd..", ".....dssdd..", "......ss...."
    ],
    olderWoman: [
      "..ddd.......", ".dHHddd.....", "dHhHHhhdd...", "dhHHHHhhhd..",
      ".dHhhssbbhd.", "..dhhsbblbd.", "..dHhsbebed.", "..dhhsacnld.",
      "...dhsbbmbd.", "....dsbbbd..", ".....dssdd..", "......ss...."
    ],
    commuter: [
      "....ddddd...", "..ddHHHhhdd.", ".dHHHHhhhhd.", ".dHhhhssbhd.",
      ".dhhssblbld.", ".dhhshbblbd.", ".dhhslbebed.", "..dhsbcbnld.",
      "..dhsbbbmbd.", "...ddssbbd..", ".....dssdd..", "......ss...."
    ],
    clerk: [
      "....dddd....", "..ddUUuudd..", ".dUUUuuuuud.", ".duuuUUuuud.",
      "..ddddhhsdd.", "..dhhsbbld..", "..dhhsbebed.", "..dhhbbcnld.",
      "...dhsbbmbd.", "....dsbbbd..", ".....dssdd..", "......ss...."
    ]
  };
  const REAR_HEADS = {
    bare: [
      "....dddd....", "..ddHHhhdd..", ".dHHHhhhhhd.", ".dHHhhhhhhd.",
      ".dHhhhhhhsd.", ".dhHhhhhhsd.", ".dhHhhhhhsd.", "..dhhhhhhd..",
      "..dhhhshhd..", "...ddhhdd...", ".....dssd...", "......ss...."
    ],
    bun: [
      "..ddd.......", ".dHHddd.....", "dHhHHhhdd...", "dhHHHHhhhd..",
      ".dHhhhhhhhd.", "..dhHhhhhhd.", "..dHHhhhhhd.", "..dhhHhhhd..",
      "...dhhhhhd..", "....ddhhd...", ".....dssd...", "......ss...."
    ],
    cap: [
      "....dddd....", "..ddUUuudd..", ".dUUUuuuuud.", ".duuuUUuuud.",
      ".dhhhhdddd..", ".dHHhhhhhhd.", "..dhHhhhhsd.", "..dhhhhhsd..",
      "...dhhhhd...", "....ddhdd...", ".....dssd...", "......ss...."
    ]
  };
  const CLOTHES = {
    young: [
      "..ddddddddd..", ".dllbttbbbsd.", ".dlbbttbblsd.", ".dlbblttbbld.",
      ".dlbblttbbbd.", ".dbblbttbbsd.", ".dbbalttbsad.", ".dbbdlttbbsd.",
      ".dbblbttbbsd.", ".dsblbttbbsd.",
      ".dsblbttbssd.", ".dssbbttsssd.", ".ddddddddddd."
    ],
    olderMan: [
      "..ddddddddd..", ".dllbttbblsd.", ".dllbttbbbsd.", ".dlbbbtbbbsd.",
      ".dlbbbtbbbld.", ".dbblbtasbsd.", ".dbbabtbsasd.", ".dbbbltbsssd.",
      ".dbbabtbsssd.", ".dsbbbtbsssd.",
      ".dsbbltbsssd.", ".dssbbtssssd.", ".ddddddddddd."
    ],
    olderWoman: [
      "..ddddddddd..", ".dllbttbblsd.", ".dlltttbblsd.", ".dlblttttbld.",
      ".dlblbttbbbd.", ".dbbbbtabsbd.", ".dbblbtbbsbd.", ".dbblbtabsbd.",
      ".dbblbtbbssd.", ".dbblbtabsdd.",
      ".dsblbtbbssd.", ".dsbbbtbsssd.", ".ddddddddddd."
    ],
    commuter: [
      "..ddddddddd..", ".dlltttbblsd.", ".dlltttbblsd.", ".dlbltatlbld.",
      ".dlbblatbbld.", ".dbbbkabbsbd.", ".dbbbkabbssd.", ".dbbkbabbsbd.",
      ".dbbkbabbsbd.", ".dbkbbabsssd.",
      ".dbkbbbssbsd.", ".dksbssssbsd.", ".ddddddddddd."
    ],
    clerk: [
      "..ddddddddd..", ".dtttttttttd.", ".dttbttbttsd.", ".dttbttbttsd.",
      ".dtlbbblatsd.", ".dbbbblabbsd.", ".dbblbbbbsbd.", ".dbbltbbbsbd.",
      ".dbblttbbsbd.", ".dsblbbssbsd.",
      ".dsblbbssbsd.", ".dsksksksssd.", ".ddddddddddd."
    ],
    rear: [
      "..ddddddddd..", ".dllbbbbbbsd.", ".dllbbbbbbsd.", ".dlbbllbbbld.",
      ".dlbbbbbbbld.", ".dbbbbbbbbsd.", ".dbblbbbbbsd.", ".dbblbbbsssd.",
      ".dbblbbssbsd.", ".dsblbbssssd.",
      ".dsblbbssbsd.", ".dssbbsssbdd.", ".ddddddddddd."
    ]
  };
  const CLOTHING_TRIM = {
    young: { t:"#ead1a7", a:"#d38d59", k:"#aa6749", s:"#773d37" },
    olderMan: { t:"#768658", a:"#c8a076", k:"#8c684d", s:"#70513b" },
    olderWoman: { t:"#efd7bf", a:"#b48083", k:"#825f78", s:"#79617d" },
    commuter: { t:"#e8d8c1", a:"#aa6053", k:"#b68a62", s:"#383951" },
    clerk: { t:"#e4cfaa", a:"#e9cd91", k:"#ba976c", s:"#325851" }
  };
  const SKIRT = [
    "..ddddddddd..", ".dllbbbbbbsd.", ".dlbbbsbbbsd.", ".dlbbssbbbsd.",
    ".dlbbsbbbsdd.", ".dbblsbbbsdd.", ".dlbbsbbbssd.", ".dlbbsbbbssd.",
    ".dsbbsbbbssd.", ".dsssssssssd.", ".ddddddddddd."
  ];
  const BOOT_FAR = ["ddd..", "dbld.", "dbbdd", ".dddd"];
  const BOOT_NEAR = [".ddd...", "dlbd...", "dbbldd.", "dbbbbdd", ".dddddd"];
  const HAND_STAMP = [".ds", "dsl", "dbs", ".dd"];
  const WICKER_STAMP = ["..dddd...", ".dt..td..", ".dt..td..", "dddddddd.",
    "dlllllld.", "dstststd.", "dslsslsd.", ".dllllld.", ".ddddddd."];
  const TOTE_STAMP = ["..dddd..", ".ds..sd.", ".ds..sd.", "dddddddd", "dllblsbd", "dlsblsbd",
    "dlsbbbdd", ".dbsssd.", ".dddddd."];
  const BRIEFCASE = [".dddd.", ".dlld.", "dddddd", "dlllld", "dssbsd", "dssssd", ".dddd."];
  const CARTONS = {
    EGG:"#efddc1", BREAD:"#d79a53", FRUIT:"#e58263", MILK:"#d2e5ea"
  };
  const STATIONARY = new Set(["pick", "standing", "stock"]);
  const STEP_LENGTH = .83;
  const SETTLE_MS = 92;

  function create({ pos, poly, rect, line, dot, shadow }) {
    const movements = new Map();

    function at(x, y, face = 1) {
      return {
        fill(a,b,w,h,color) { rect(x+(face > 0 ? a : -a-w),y+b,w,h,color); },
        shape(points, color, edge) { poly(points.map(([a,b]) => [x+face*a,y+b]),color,edge); },
        stroke(points,color,width = 1) { line(points.map(([a,b]) => [x+face*a,y+b]),color,width); }
      };
    }

    function displayedPose(step, renderTime) {
      const move = step.transition;
      if (!move || !Number.isFinite(renderTime)) return { x:step.x, y:step.y, pace:step.pace };
      const ratio = Math.max(0,Math.min(1,(renderTime-move.started)/move.duration));
      return {
        x:move.from.x+(step.x-move.from.x)*ratio,
        y:move.from.y+(step.y-move.from.y)*ratio,
        pace:move.from.pace+(step.pace-move.from.pace)*ratio
      };
    }

    function motion(p, index, tick, staff, renderTime) {
      const key = p.motionKey ?? (staff ? (p.role || "clerk") : (p.id ?? `shopper-${index}`));
      const now = Number.isFinite(renderTime) ? renderTime : tick;
      let step = movements.get(key);
      if (!step || tick < step.tick || now < step.sampleAt) {
        step = { x:p.x, y:p.y, tick, pace:0, movedAt:-Infinity, sampleAt:now, face:1, back:false, turnAt:-Infinity };
        movements.set(key,step);
        if (movements.size > 96) movements.delete(movements.keys().next().value);
      }
      const dx = p.x-step.x, dy = p.y-step.y;
      const distance = Math.hypot(dx,dy);
      const stopped = STATIONARY.has(p.stage) || p.motion === "waiting";
      if (distance >= .018 && distance < 2) {
        const from = displayedPose(step,renderTime);
        const lastDuration = step.transition?.duration ?? 100;
        const restarting = now-step.movedAt > lastDuration+12+SETTLE_MS;
        if (restarting) {
          step.pace = 0;
          from.pace = 0;
        }
        const face = Math.abs(dx-dy) >= distance*.30 ? (dx-dy > 0 ? 1 : -1) : step.face;
        const back = Math.abs(dx+dy) >= distance*.30 ? dx+dy < 0 : step.back;
        if ((face !== step.face || back !== step.back) && (distance >= .16 || now-step.turnAt >= 85)) {
          Object.assign(step,{ face, back, turnAt:now });
        }
        const duration = now-step.sampleAt;
        if (duration > 0) {
          const gap = Math.max(12,Math.min(118,duration));
          step.sampleGap = restarting || !step.sampleGap ? gap : step.sampleGap*.72+gap*.28;
        }
        step.transition = duration > 0 && Number.isFinite(renderTime)
          ? { from, started:now, duration:Math.min(118,Math.max(duration,step.sampleGap*1.4)) }
          : null;
        step.pace += distance;
        step.movedAt = now;
        step.sampleAt = now;
      } else if (distance >= 2) {
        step.pace = 0;
        step.movedAt = -Infinity;
        step.transition = null;
        step.sampleAt = now;
      }
      if (distance >= .018) Object.assign(step,{ x:p.x, y:p.y });
      step.tick = tick;
      const display = displayedPose(step,renderTime);
      const grace = stopped ? 0 : (step.transition?.duration ?? 100) + 12;
      const fade = 1-Math.max(0,Math.min(1,(now-step.movedAt-grace)/SETTLE_MS));
      const strideWeight = fade*Math.min(1,display.pace/(STEP_LENGTH*.25));
      return {
        moving:strideWeight > .02, face:step.face, back:step.back,
        phase:(display.pace/STEP_LENGTH)%1, strideWeight,
        x:display.x, y:display.y
      };
    }

    function stamp({ fill }, rows, tones, x, y) {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        let start = 0;
        while (start < row.length) {
          const tone = row[start];
          let end = start + 1;
          while (end < row.length && row[end] === tone) end++;
          if (tone !== ".") fill(x+start, y+r, end-start, 1, tones[tone]);
          start = end;
        }
      }
    }

    function faceDetails(draw, { name, hair, sheen, skin, accent }, headY, back) {
      const capped = name === "olderMan" || name === "clerk";
      const rear = name === "olderWoman" ? REAR_HEADS.bun : capped ? REAR_HEADS.cap : REAR_HEADS.bare;
      const tones = { d:"#3c2c30", h:hair, H:sheen, b:skin, l:"#f8d5ae", s:"#ac745d", e:"#49343a",
        c:"#d08a79", n:"#bb8063", m:"#94594d", a:accent, u:name === "clerk" ? "#c48846" : "#946a54",
        U:name === "clerk" ? "#e9b263" : "#bf916f" };
      stamp(draw,back ? rear : HEADS[name],tones,-6,headY);
    }

    function footfall(phase) {
      const planted = .62;
      if (phase < planted) return { travel:1-2*phase/planted, lift:0 };
      const swing = (phase-planted)/(1-planted);
      return { travel:-1+2*swing*swing*(3-2*swing), lift:Math.sin(Math.PI*swing) };
    }

    function pixelLimb({ fill }, start, bend, end, width, { d, b, l }) {
      const length = end.y-start.y;
      for (let y = 0; y <= length; y++) {
        const t = y / length;
        const x = Math.round(t < .5 ? start.x+(bend-start.x)*t*2 : bend+(end.x-bend)*(t*2-1));
        const left = x-Math.floor(width/2);
        fill(left,start.y+y,width,1,d);
        fill(left+1,start.y+y,width-2,1,b);
        if (y > 0 && y < length-1 && width > 3) fill(left+1,start.y+y,1,1,l);
      }
    }

    function shoe(draw, hip, ankle, trouser, glint, sole, near = false) {
      const length = ankle.y-hip.y;
      const knee = Math.round((hip.x+ankle.x)*.5)+(near ? 1 : -1);
      for (let row = 0; row < length; row++) {
        const t = row/length;
        const center = Math.round(t < .5 ? hip.x+(knee-hip.x)*t*2 : knee+(ankle.x-knee)*(t*2-1));
        const cuff = row === length-1;
        const width = t < .30 ? 5 : t < .58 || cuff ? 4 : 3;
        const left = center-Math.floor(width/2);
        draw.fill(left,hip.y+row,width,1,OUTLINE);
        draw.fill(left+1,hip.y+row,width-2,1,cuff ? glint : trouser);
        if (near && t > .3 && t < .7) draw.fill(left+1,hip.y+row,1,1,glint);
      }
      stamp(draw,near ? BOOT_NEAR : BOOT_FAR,{ d:BOOT, b:sole, l:glint },ankle.x-2,ankle.y-(near ? 2 : 1));
    }

    function arm(draw, shoulder, hand, look) {
      const middle = Math.round((shoulder.x+hand.x)*.5);
      pixelLimb(draw,shoulder,middle,hand,4,{ d:OUTLINE, b:look.coat, l:look.lit });
      stamp(draw,HAND_STAMP,{ d:OUTLINE, b:look.skin, s:SKIN_SHADE, l:"#f8c79c" },hand.x-1,hand.y);
    }

    function basket(draw, x, y, canvasBag, contents) {
      const tones = canvasBag
        ? { d:"#594039", b:"#dac5a4", l:"#f1e1b9", s:"#9a895c" }
        : { d:WICKER[0], l:WICKER[3], s:WICKER[1], t:WICKER[2] };
      stamp(draw,canvasBag ? TOTE_STAMP : WICKER_STAMP,tones,x,y);
      if (contents) draw.fill(x+3,y+3,2,1,contents);
    }

    function person(p, index = 0, tick = 0, staff = false, renderTime) {
      const look = WARDROBE[staff ? 4 : ((index % 4) + 4) % 4];
      const { name, coat, lit, legs, dark } = look;
      const skirt = name === "olderWoman";
      const elder = skirt || name === "olderMan";
      const pose = motion(p,index,tick,staff,renderTime);
      const { moving, phase, face, back } = pose;
      const [x, y] = pos({ ...p, x:pose.x, y:pose.y });
      const density = Number.isFinite(renderTime) ? 2 : 1;
      const anchorX = Math.round(x*density)/density, anchorY = Math.round(y*density)/density;
      const gait = moving ? pose.strideWeight : 0;
      const far = footfall(phase);
      const near = footfall((phase+.5)%1);
      const direction = back ? -1 : 1;
      const pace = gait * (elder ? 2.6 : 3.25);
      const swing = (far.travel-near.travel)*gait*.5;

      shadow(anchorX+1,anchorY+1,9,3.8,"#493b3d51");
      const body = at(anchorX,anchorY,face);
      const farFoot = { x:-4+Math.round(far.travel*pace), y:-2+Math.round(far.travel*pace*.34*direction-far.lift*gait*2) };
      const nearFoot = { x:2+Math.round(near.travel*pace), y:-1+Math.round(near.travel*pace*.34*direction-near.lift*gait*2) };
      shoe(body,{ x:-3,y:-11 },farFoot,skirt ? "#c59377" : dark,"#88735f","#4c3c40");
      shoe(body,{ x:1,y:-11 },nearFoot,skirt ? "#e0ad89" : legs,"#b89a77","#64505a",true);
      if (skirt) stamp(body,SKIRT,{ d:OUTLINE, b:legs, l:"#9e7388", s:dark },-6,-14);

      const working = !moving && (p.stage === "pick" || p.stage === "pay" || p.stage === "stock" ||
        (p.stage === "checkout" && p.active !== false));
      const reach = working ? Math.round(2*(1-Math.cos(tick*Math.PI/1050))) : 0;
      const farHand = { x:-6-Math.round(swing*2), y:-11-Math.round(Math.max(0,-swing)) };
      const nearHand = { x:6+Math.round(swing*2)+reach, y:-11-Math.round(reach*.55+Math.max(0,swing)) };
      arm(body,{ x:-6,y:-21 },farHand,look);
      stamp(body,back ? CLOTHES.rear : CLOTHES[name],{ d:OUTLINE, b:coat, l:lit, ...CLOTHING_TRIM[name] },-6,-22);
      if (back && staff) {
        body.fill(-3,-18,5,1,"#9eaa85");
        body.fill(-1,-17,1,2,"#9eaa85");
      }
      if (name === "commuter") {
        stamp(body,BRIEFCASE,{ d:"#614438", l:"#d8ac7a", s:"#967054", b:"#b38a60" },-7,-15);
      }
      faceDetails(body,look,elder ? -31 : -32,back);
      arm(body,{ x:6,y:-21 },nearHand,look);
      if (!staff || p.carrying) basket(body,nearHand.x-1,nearHand.y+2,skirt || name === "commuter",CARTONS[p.item]);
      if (working && (!staff || p.stage === "checkout" || p.carrying)) {
        const color = p.stage === "pay" ? "#b1d0a3" : CARTONS[p.item] || "#e5c899";
        stamp(body,[".dd","dbd","dld",".dd"],{ d:"#704d42",b:color,l:"#f2e5c1" },nearHand.x+1,nearHand.y-1);
      }
    }

    function restocker(restock, tick = 0, renderTime) {
      const { x, y } = restock;
      const stocked = restock.progress >= .4 && restock.progress <= .6;
      const stage = stocked ? "stock" : "cart";
      const pose = motion({ x,y,stage,motionKey:"restock-cart" },0,tick,true,renderTime);
      const [px, py] = pos({ x:pose.x+.25,y:pose.y-.2 });
      const { fill, shape, stroke } = at(px, py);
      shadow(px+2,py+2,11,4,"#4a38395b");

      shape([[-6,-9],[3,-13],[10,-9],[2,-5]],"#aa805e",OUTLINE);
      shape([[-6,-9],[2,-5],[2,1],[-6,-2]],"#946b51",OUTLINE);
      shape([[2,-5],[10,-9],[10,-3],[2,1]],"#705249",OUTLINE);
      fill(-6,-1,2.5,3.5,"#494245");
      fill(7,-2,2.5,3.5,"#494245");
      fill(-5,.1,1,1,"#c3a37b");
      fill(8,-.9,1,1,"#c3a37b");
      stroke([[-6,-6],[-6,-12],[-9,-14],[-12,-13]],"#715b50",1.65);
      stroke([[-6,-6],[2,-3],[10,-7]],"#e2b280",.8);
      shape([[-3,-12],[1,-15],[6,-12],[1,-9]],"#e5c69b",OUTLINE);
      shape([[-3,-12],[1,-9],[1,-5],[-3,-8]],"#c09a75",OUTLINE);
      shape([[1,-9],[6,-12],[6,-7],[1,-5]],"#a4795d",OUTLINE);
      stroke([[-1,-14],[4,-11],[4,-8]],"#7ba2ad",1.05);

      person({ x:x-.25,y:y+.19,stage,motionKey:"restock-clerk" },0,tick,true,renderTime);
    }

    function robot(view, tick = 0) {
      const position = view.position || [1,7];
      const [x, y] = pos(position, view.robotRenderZ || 0);
      const { fill, shape, stroke } = at(x, y);
      const waiting = /等待|避让|停车|人工|停靠/.test(view.phase || "");
      const picking = /取货|核验/.test(view.phase || "");
      const body = "#149dc0";
      const blueShade = "#176b91";
      const blueLight = "#75d4df";
      const ivory = "#f6e2bb";
      const ivoryShade = "#bb946f";
      const bronze = "#da9d47";
      const ink = "#304554";

      shadow(x+1,y+2,13,5.4,"#263b4e63");
      shape([[-12,-7],[-8,-10],[9,-9],[12,-6],[12,-2],[7,2],[-8,2],[-12,-1]],"#35404d",ink);
      shape([[-11,-5],[3,-4],[3,1],[-9,1],[-11,-1]],"#5c5b60",ink);
      shape([[3,-4],[11,-7],[11,-2],[6,1],[3,1]],"#464b54",ink);
      for (const a of [-8,-5,-2,1]) fill(a,-3,1.15,3,"#978479");
      for (const a of [6,9]) fill(a,-4,1,3,"#9a8c80");
      fill(-7,-4,5,1,"#c28650");
      fill(4,-4,2,2,"#d4a25d");

      shape([[-9,-24],[4,-25],[8,-21],[7,-6],[4,-4],[-8,-5],[-10,-9]],body,ink);
      shape([[4,-25],[8,-28],[12,-24],[12,-9],[7,-5],[7,-20]],blueShade,ink);
      shape([[-9,-24],[-5,-28],[8,-28],[12,-24],[8,-21],[4,-23]],blueLight,ink);
      stroke([[-9,-22],[-9,-11],[-8,-7]],"#8adce2",1.05);
      stroke([[11,-23],[11,-11],[8,-8]],"#38aacc",.9);
      shape([[-8,-23],[2.6,-23],[5,-21],[4,-17],[-6.5,-17],[-8,-19]],ivory,ivoryShade);
      fill(-7,-21.6,10.6,3.1,"#344450");
      fill(-6,-21.4,1.6,1.9,waiting ? "#efbd87" : "#a5f0dc");
      fill(.5,-21.4,1.6,1.9,waiting ? "#efbd87" : "#a5f0dc");
      fill(-6.5,-18.5,8.8,.55,"#69838c");
      shape([[-6.5,-16],[1.8,-15.5],[1.5,-7],[-5.7,-7]],ivory,ivoryShade);
      for (const b of [-13,-11.4,-9.7]) fill(-4.8,b,4.9,.75,blueShade);
      fill(-8.5,-9,1.75,2.7,bronze);
      fill(3.8,-8,2,2.25,bronze);
      fill(-3,-15,2.15,.65,"#f3bc5e");

      // Wicker grocery tray, with tiny products driven by the actual basket.
      shape([[-5,-29],[-2,-32],[6,-32],[9,-30],[5,-27],[-3,-27]],WICKER[3],WICKER[0]);
      shape([[-5,-29],[-3,-27],[5,-27],[9,-30],[9,-27.2],[5,-24.7],[-3,-25.2],[-5,-27]],WICKER[1],WICKER[0]);
      stroke([[-4.3,-27.9],[-2.5,-26],[5,-25.6],[8.4,-27.5]],WICKER[2],.7);
      for (const a of [-2,0,2,4]) fill(a,-26.2,.6,1.1,WICKER[3]);
      stroke([[-2,-31],[-2,-34],[0,-35],[6,-35],[8,-33],[8,-31]],WICKER[0],1.25);
      stroke([[0,-35],[5,-35]],"#edb66b",.8);
      if (view.handoff !== "shopping") {
        const stocked = Object.keys(CARTONS).filter(key => view.basket?.[key] > 0);
        stocked.forEach((key, i) => {
          const a = -2.5 + i * 2.2;
          fill(a,-31-(i%2),2.3,2.5,CARTONS[key]);
          fill(a,-31-(i%2),1,.55,"#f9edcf");
        });
      }

      dot(x+8.5,y-19.5,bronze,2.25);
      dot(x+8.5,y-19.5,"#f6ce80",1.25);
      if (picking) {
        const reach = -15.6-Math.sin(tick/160)*1.15;
        const clawArm = [[-8.6,-17.6],[-12.1,-19.2],[reach,-21.4]];
        stroke(clawArm,ink,2.2);
        stroke(clawArm,ivory,1.15);
        stroke([[reach-.8,-22.5],[reach,-21.4],[reach-1.5,-20.7]],bronze,1.05);
        dot(x-8.5,y-17.5,bronze,1.5);
      } else {
        const clawArm = [[8.6,-18],[9.1,-14],[9.5,-11.7]];
        stroke(clawArm,ink,2.2);
        stroke(clawArm,ivory,1.15);
        stroke([[8.4,-11.7],[9.5,-10.5],[10.7,-11.7]],bronze,.9);
      }
    }

    return { person, robot, restocker };
  }

  window.PixelStoreCharacters = { create };
})();

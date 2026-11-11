(() => {
  "use strict";

  const WIDTH = 800;
  const HEIGHT = 520;
  const RASTER_SCALE = 2;
  const MAX_SURFACE_EDGE = 2560;
  const VIEW_BOUNDS = { left:2, top:42, right:790, bottom:510 };
  const VIEW_PADDING = 7;
  const OUTER = "#0c1423";
  const OX = 355;
  const OY = 121;
  const U = 16;
  const V = 8;
  const SIDEWALK_Z = -19;
  const WEST_OCCLUSION_TOP = 8;
  const WEST_OCCLUSION_BOTTOM = 18.35;
  const FLOOR = ["#a79d8a", "#9d9483", "#b4a992", "#a69b88", "#ada392", "#a29684"];
  const EDGE = "#43332e";
  const STONE = ["#b9a997", "#817b72", "#686660"];
  const WOOD = ["#c99458", "#a76a42", "#875538"];
  const CREAM = ["#f6dfb7", "#ccaf87", "#ab8f70"];
  const RUST = ["#c98358", "#a8543c", "#854335"];
  const JADE = ["#93a282", "#668470", "#4a6d59"];
  const TEAL = ["#7ca9ad", "#5c878e", "#3b6371"];
  const STEEL = ["#d5d9c9", "#9aacaa", "#738d93"];
  const DARK = ["#6c6356", "#534c48", "#3c4141"];
  const MILK_SHELF = ["#82afc7", "#4b82a6", "#385979"];
  const FRUIT_SHELF = ["#edb171", "#c88158", "#99593e"];
  const DRINK_SHELF = ["#90b9b5", "#568f8a", "#366966"];
  const ESSENTIAL_SHELF = ["#b3a9c5", "#827695", "#615472"];
  const SHELF_PALETTES = { eggs:JADE, milk:MILK_SHELF, fruit:FRUIT_SHELF, drinks:DRINK_SHELF, essentials:ESSENTIAL_SHELF };
  const COUNTER_OAK = ["#eed3a5", "#ad7857", "#85583f"];
  const COUNTER_BASE = ["#bc9069", "#805a49", "#60463e"];
  const DOOR_TIMBER = ["#bb8a63", "#815740", "#644536"];
  const DOOR_TRIM = ["#d6a273", "#a77353", "#885e48"];
  const START = [1, 7];
  const ENTRANCE = { x:.13, y:7.49, outer:1.18, jamb:.22, depth:8.1 };
  const DOCK = [1, 10];
  const ROBOT_WAIT = [8, 15];
  const EXIT = [22, 16];
  const STAFF_CHECKOUT = [19.95, 14];
  const CHECKOUT = [22, 14];
  const CHECKOUT_QUEUE = [[22, 11], [22, 8], [22, 5]];
  const CHECKOUT_COUNTER = { left:21.04, right:21.68, top:11.87, bottom:15.18, depth:36.45 };
  const SHOP_DECOR = {
    bonsai:[1.59,.52], snakePlant:[.54,14.80], pothos:[21.39,.10],
    paperLantern:[5.40,.43], floorAndon:[10.93,17.37], candleLantern:[3.03,.53]
  };
  const SHELF_BOUNDS = [5, 11, 17].map(x => [x, x + 1, 4, 11]);
  const CABINET_WIDTH = 2.50;
  const CABINET_BAY = 1.18;
  const CABINET_START = 3.29;
  const CABINET_BAYS_PER_HALF = 4;
  const CABINET_HALF = CABINET_BAY * CABINET_BAYS_PER_HALF;
  const CABINET_END = CABINET_START + 2 * CABINET_HALF;
  const BAY_EXTENSION = CABINET_BAY - 1;
  const CABINET_FRONT = CABINET_WIDTH - .01;
  const CABINET_HEIGHT = { eggs:24, milk:36, bread:29, fruit:14, drinks:34, essentials:29 };
  const cabinets = [
    { x:5.04, halves:[
      { sku:"EGG", style:"eggs", title:"鸡蛋", point:[8, 5] },
      { sku:"FRUIT", style:"fruit", title:"鲜切水果", point:[8, 10] }
    ] },
    { x:11.04, halves:[
      { sku:"BREAD", style:"bread", title:"面包", point:[14, 5] },
      { sku:"MILK", style:"milk", title:"牛奶", point:[14, 10] }
    ] },
    { x:17.04, halves:[
      { style:"drinks", title:"饮料" },
      { style:"essentials", title:"日用品" }
    ] }
  ];
  const shopMarkers = [
    { point:EXIT, color:"#645579", edge:"#483752" },
    ...cabinets.flatMap(({halves}) => halves.filter(({point}) => point).map(({point, style}) => ({
      point, color:SHELF_PALETTES[style]?.[1] || WOOD[1], edge:SHELF_PALETTES[style]?.[2] || WOOD[2]
    })))
  ];

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function point(x, y, z = 0) {
    return [OX + (x - y) * U, OY + (x + y) * V - z];
  }

  function xy(value) {
    return Array.isArray(value) ? { x: value[0], y: value[1] } : value;
  }

  function pos(value, z = 0) {
    const { x, y } = xy(value);
    return point(x + 0.5, y + 0.5, z);
  }

  function groundHeight(value) {
    const { x, y } = xy(value);
    if (y >= 18) return SIDEWALK_Z;
    if (y > 17.45) return SIDEWALK_Z * (y - 17.45) / .55;
    if (x >= 0) return 0;
    // The west steps rise from the pavement as the robot approaches the doorway.
    const nearEntry = Math.max(0, 1 - Math.abs(y - START[1]));
    const stepRise = Math.min(1,Math.max(0,(x+2)/1.55)) * nearEntry;
    return SIDEWALK_Z * (1 - stepRise);
  }

  function groundPos(value, lift = 0) {
    return pos(value, groundHeight(value) + lift);
  }

  function behindWestWall({ x, y }) {
    return x < 0 && y > WEST_OCCLUSION_TOP && y < WEST_OCCLUSION_BOTTOM;
  }

  function actorDepth({ x, y }, bias) {
    const depth = x+y+bias;
    const counter = CHECKOUT_COUNTER;
    const floorX = x+.5;
    const floorY = y+.5;
    if (floorX < counter.left-1.36 || floorX > counter.right+1.24 ||
        floorY < counter.top-.82 || floorY > counter.bottom+.95) return depth;
    // A long counter cannot use its center to occlude actors on the lane side.
    const relative = (depth-counter.depth)*.008;
    if (floorX >= counter.right+.04 || floorY >= counter.bottom+.04) {
      return Math.max(depth,counter.depth+.065+relative);
    }
    if (floorX <= counter.left-.04 || floorY <= counter.top-.04) {
      return Math.min(depth,counter.depth-.065+relative);
    }
    return depth;
  }

  function create(canvas) {
    const screen = canvas.getContext("2d");
    const background = document.createElement("canvas");
    const ambience = document.createElement("canvas");
    background.width = WIDTH * RASTER_SCALE;
    background.height = HEIGHT * RASTER_SCALE;
    const world = background.getContext("2d");
    world.scale(RASTER_SCALE, RASTER_SCALE);
    let ctx = world;
    let robotAnchor = null;
    let measuredSize;
    let surface;
    const furniture = [];
    const snap = value => Math.round(value * RASTER_SCALE) / RASTER_SCALE;

    if (typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(([{ contentRect }]) => {
        if (contentRect.width > 0 && contentRect.height > 0) {
          measuredSize = { width:contentRect.width, height:contentRect.height };
        }
      });
      observer.observe(canvas);
    }

    function drawAmbience({ width, height, fit, centerX, centerY }) {
      const layer = ambience.getContext("2d");
      layer.setTransform(ambience.width/width,0,0,ambience.height/height,0,0);
      const x = width/2 + (405-centerX)*fit;
      const y = height/2 + (250-centerY)*fit;
      const radius = Math.max(475*fit, Math.hypot(width,height)*.51);
      const glow = layer.createRadialGradient(x,y,50*fit,x,y,radius);
      glow.addColorStop(0,"#44536a");
      glow.addColorStop(.48,"#25364e");
      glow.addColorStop(.78,"#162239");
      glow.addColorStop(1,OUTER);
      layer.fillStyle = glow;
      layer.fillRect(0,0,width,height);
      const rand = rng(6143);
      const grain = Math.min(375, Math.round(165*width*height/(WIDTH*HEIGHT*fit*fit)));
      for (let i = 0; i < grain; i++) {
        layer.fillStyle = i%4 ? "#8ca1bf2c" : "#b5c7e23d";
        layer.fillRect(rand()*width,rand()*height,(i%11 === 0 ? 2 : 1)*fit,.5*fit);
      }
    }

    function fitSurface() {
      const width = measuredSize?.width || canvas.clientWidth || WIDTH;
      const height = measuredSize?.height || canvas.clientHeight || HEIGHT;
      const ratio = Math.min(RASTER_SCALE,Math.max(1.5,Number(window.devicePixelRatio)||RASTER_SCALE),MAX_SURFACE_EDGE/Math.max(width,height));
      const pixelsWide = Math.max(1,Math.round(width*ratio));
      const pixelsHigh = Math.max(1,Math.round(height*ratio));
      if (surface?.width === width && surface.height === height && canvas.width === pixelsWide && canvas.height === pixelsHigh) return surface;
      if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
      if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
      ambience.width = pixelsWide;
      ambience.height = pixelsHigh;
      const { left, right, top, bottom } = VIEW_BOUNDS;
      const fit = Math.min(width/(right-left+2*VIEW_PADDING),height/(bottom-top+2*VIEW_PADDING));
      surface = { width, height, fit, centerX:(left+right)/2, centerY:(top+bottom)/2 };
      drawAmbience(surface);
      return surface;
    }

    function rect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(snap(x), snap(y), Math.max(.5, snap(w)), Math.max(.5, snap(h)));
    }

    function poly(points, color, border) {
      ctx.beginPath();
      points.forEach(([x, y], i) => {
        const px = snap(x) + .25;
        const py = snap(y) + .25;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      if (color) {
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (border) {
        ctx.lineWidth = .75;
        ctx.strokeStyle = border;
        ctx.stroke();
      }
    }

    function line(points, color, width = 1, dash = []) {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      points.forEach(([x, y], i) => {
        if (i) ctx.lineTo(snap(x) + .25, snap(y) + .25);
        else ctx.moveTo(snap(x) + .25, snap(y) + .25);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function face(x, y, w, d, z, color, border) {
      poly([point(x, y, z), point(x + w, y, z), point(x + w, y + d, z), point(x, y + d, z)], color, border);
    }

    function floorGradient(ax,ay,bx,by,z = 0) {
      // A floor fade must run perpendicular to the projected edge it follows.
      const alongX = ax !== bx;
      const distance = alongX ? bx-ax : by-ay;
      const span = 2*U*V*distance/(U*U+V*V);
      const [x,y] = point(ax,ay,z);
      return ctx.createLinearGradient(x,y,x+(alongX ? V : -V)*span,y+U*span);
    }

    function box(x, y, w, d, h, colors, z = 0, border = EDGE) {
      const a = point(x, y, z + h);
      const b = point(x + w, y, z + h);
      const c = point(x + w, y + d, z + h);
      const e = point(x, y + d, z + h);
      poly([e, c, point(x + w, y + d, z), point(x, y + d, z)], colors[1], border);
      poly([b, c, point(x + w, y + d, z), point(x + w, y, z)], colors[2], border);
      poly([a, b, c, e], colors[0], border);
    }

    function mark(x, y, text, color, size = 7, align = "center") {
      ctx.font = `700 ${size}px "SFMono-Regular", Consolas, monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(text, Math.round(x), Math.round(y));
    }

    function dot(x, y, color, radius = 2) {
      rect(x - radius + 1, y - radius, radius * 2 - 2, 1, color);
      rect(x - radius, y - radius + 1, radius * 2, radius * 2 - 2, color);
      rect(x - radius + 1, y + radius - 1, radius * 2 - 2, 1, color);
    }

    function shadow(x, y, width = 12, height = 5, color = "#49392d44") {
      poly([[x - width, y], [x - width * .72, y - height * .75],
        [x, y - height], [x + width * .72, y - height * .75],
        [x + width, y], [x + width * .72, y + height * .75],
        [x, y + height], [x - width * .72, y + height * .75]], color);
    }

    const { person, robot, restocker } = window.PixelStoreCharacters.create({ point, pos, box, poly, rect, line, dot, shadow });

    function wallRun(side, start, end) {
      const lineAt = (i, z) => side === "north" ? point(i, 0, z) : point(0, i, z);
      const outerAt = (i, z) => side === "north" ? point(i, -.42, z) : point(-.42, i, z);
      const mid = (start+end)/2;
      const top = side === "north" ? "#756e6c" : "#907f72";
      const low = ctx.createLinearGradient(...lineAt(mid,13),...lineAt(mid,0));
      low.addColorStop(0,side === "north" ? "#53606b" : "#5f6973");
      low.addColorStop(.39,"#404e60");
      low.addColorStop(1,"#283b50");
      const high = ctx.createLinearGradient(...lineAt(mid,57),...lineAt(mid,16));
      high.addColorStop(0,side === "north" ? "#9a9090" : "#9d9391");
      high.addColorStop(.27,side === "north" ? "#c9bba4" : "#d2c2a8");
      high.addColorStop(.73,"#b4a594");
      high.addColorStop(1,"#89878c");
      poly([lineAt(start, 0), lineAt(end, 0), lineAt(end, 57), lineAt(start, 57)], high, EDGE);
      poly([lineAt(start, 0), lineAt(end, 0), lineAt(end, 13), lineAt(start, 13)], low);
      poly([lineAt(start, 12), lineAt(end, 12), lineAt(end, 16), lineAt(start, 16)], "#80654f");
      poly([lineAt(start, 13.7), lineAt(end, 13.7), lineAt(end, 14.55), lineAt(start, 14.55)], "#bda07a");
      line([lineAt(start,15.4),lineAt(end,15.4)],"#d7b990",.64);
      poly([lineAt(start, 53), lineAt(end, 53), lineAt(end, 58), lineAt(start, 58)], "#433f4a");
      poly([lineAt(start, 58), outerAt(start, 58), outerAt(end, 58), lineAt(end, 58)], top, EDGE);
      const rand = rng(side === "north" ? 98 : 400);
      for (let i = 0; i < 115; i++) {
        const z = 2 + rand() * 52;
        const t = start + rand() * (end - start);
        const [x, y] = lineAt(t, z);
        rect(x, y, i % 8 === 0 ? 2 : 1, 1, z < 13 ? "#705b4a55" : "#987b6655");
      }
      for (let i = start + .8; i < end; i += .8) {
        line([lineAt(i, 1), lineAt(i, 12)], "#1d303b9e", .95);
        line([lineAt(i + .07, 2), lineAt(i + .07, 10)], "#819aab7f", .6);
        line([lineAt(i+.13,10.4),lineAt(Math.min(i+.68,end),10.4)],"#6e8a9b42",.55);
      }
      line([lineAt(start,2),lineAt(end,2)],"#1d303b",1.3);
    }

    function windowRun(side, from, to) {
      const at = (i, z) => side === "north" ? point(i, .015, z) : point(.015, i, z);
      const slab = (a, b, low, hi, color, border) =>
        poly([at(a, low), at(b, low), at(b, hi), at(a, hi)], color, border);
      const glass = ctx.createLinearGradient(...at((from+to)/2,49),...at((from+to)/2,19));
      glass.addColorStop(0,"#9b9993");
      glass.addColorStop(.22,"#b7b2a5");
      glass.addColorStop(.44,"#d1c9b2");
      glass.addColorStop(.74,"#aca493");
      glass.addColorStop(1,"#747f87");
      slab(from - .11, to + .11, 17, 52, "#514449", "#3b3d47");
      slab(from + .04, to - .04, 19, 49, glass, "#6a5145");
      slab(from + .04, to - .04, 19, 24, "#9f795947");
      slab(from + .05, to - .05, 44.5, 48.8, "#e5dfd05e");
      const rand = rng(Math.floor(from * 20));
      for (let i = 0; i < 46; i++) {
        const [x, y] = at(from + .12 + rand() * (to - from - .24), 20 + rand() * 28);
        rect(x, y, i % 3 === 0 ? 2 : .5, .5, ["#8a6b6142", "#ffedc268", "#b38d6942"][i % 3]);
      }
      for (const z of [26,43]) line([at(from, z), at(to, z)], "#8e6c54", .85);
      for (let i = from; i <= to + .1; i += (to - from) / 3) {
        line([at(i, 18), at(i, 51)], "#614337", 2.3);
        line([at(i + .055, 19), at(i + .055, 49)], "#b78961", .75);
        if (i+.34 < to) {
          poly([at(i+.16,46),at(i+.29,46),at(i+.39,28),at(i+.31,28)],"#ede3c15f");
          line([at(i+.38,45),at(i+.50,31)],"#fff0c54f",.55);
        }
      }
      for (let i = from + .36; i < to - .1; i += .71) {
        line([at(i,44),at(i,48)],"#e1d7be",.6);
        line([at(i+.1,20),at(i+.1,25)],"#906b594f",.55);
      }
      line([at(from - .15, 17), at(to + .15, 17)], "#563d35", 2.9);
      line([at(from - .14, 19), at(to + .14, 19)], "#d3a47a", 1.2);
      line([at(from, 50), at(to, 50)], "#c39670", 1.3);
      line([at(from+.08,47.25),at(to-.08,47.25)], "#e4dec997", .72);
    }

    function eave(side, to) {
      const at = (i, o, z) => side === "north" ? point(i,o,z) : point(o,i,z);
      const ridge = -.67;
      const edge = .69;
      const pitch = offset => 65 - (offset - ridge) * 9 / (edge - ridge);
      const slope = (i, o) => at(i, o, pitch(o));
      // Both planes end on the x=y hip so their sloping faces share one edge.
      const outline = [slope(ridge,ridge), slope(to,ridge), slope(to,edge), slope(edge,edge)];
      poly(outline, "#414960", "#252e48");
      ctx.save();
      poly(outline);
      ctx.clip();
      for (let i = ridge, row = 0; i < to; i += .30, row++) {
        const end = Math.min(to, i + .285);
        poly([slope(i,ridge),slope(end,ridge),slope(end,edge),slope(i,edge)], row % 3 ? "#38435b" : "#414d63");
        poly([slope(i+.035,ridge),slope(i+.10,ridge),slope(i+.10,edge),slope(i+.035,edge)],"#697c9337");
        line([slope(i+.065,ridge),slope(i+.065,edge)], "#657b99", .85);
        if (row % 3 === 1) line([slope(i+.06,.32),slope(i+.06,.59)], "#92aac79c", .72);
        if (row % 5 === 2) line([slope(i+.08,edge),slope(end-.025,edge)], "#a5bac399", .65);
      }
      for (const o of [-.24,.22,edge]) line([slope(o,o),slope(to,o)], "#2b344d", 1.15);
      ctx.restore();
      line([slope(ridge,ridge),slope(to,ridge)], "#78869d", 1.5);
      poly([at(edge,edge,55.5),at(to,edge,55.5),at(to,edge,51.8),at(edge,edge,51.8)],"#333849","#282f40");
      line([at(edge,edge,55.1),at(to,edge,55.1)],"#8e9caa",.8);
      line([at(edge,edge,52.7),at(to,edge,52.7)],"#b58659",.9);
      for (let r = 1.18; r < to; r += .66) {
        line([at(r,edge,52.2),at(r+.22,edge,52.2)],"#d19a62",.7);
      }
    }

    function wallPoster(side, p, width, z, poster, accent) {
      const at = (i, height) => side === "north" ? point(i, .04, height) : point(.04, i, height);
      poly([at(p, z), at(p + width, z), at(p + width, z + 14), at(p, z + 14)], "#665648");
      poly([at(p + .09, z + 1), at(p + width - .09, z + 1), at(p + width - .09, z + 13), at(p + .09, z + 13)], poster);
      for (let h = 0; h < 3; h++) {
        line([at(p + .17, z + 4 + h * 3), at(p + width - .16 - .09 * (h % 2), z + 4 + h * 3)], accent);
      }
    }

    function beveledRing(x,y,rx,ry,z) {
      return [[-.65,-1],[.65,-1],[1,-.65],[1,.65],[.65,1],[-.65,1],[-1,.65],[-1,-.65]]
        .map(([u,v]) => point(x+u*rx,y+v*ry,z));
    }

    function roundVessel(x,y,rx,ry,z,h,tones) {
      const top = beveledRing(x,y,rx,ry,z+h);
      const bottom = beveledRing(x,y,rx*.85,ry*.85,z);
      for (let i = 2; i <= 5; i++) {
        const midX = (top[i][0]+top[i+1][0])/2;
        const midY = (top[i][1]+top[i+1][1])/2;
        const shade = ctx.createLinearGradient(midX,midY,midX,midY+h);
        shade.addColorStop(0,tones[i-1]);
        shade.addColorStop(.45,tones[i-1]);
        shade.addColorStop(1,tones[4]);
        poly([top[i],top[i+1],bottom[i+1],bottom[i]],shade,tones[4]);
      }
      poly(top,tones[0],tones[4]);
      return top;
    }

    function mossCrown(x,y,w,h,seed) {
      poly([[x-w,y+h*.4],[x-w*.82,y-h*.43],[x-w*.45,y-h*.43],[x-w*.26,y-h],
        [x+w*.42,y-h],[x+w*.75,y-h*.57],[x+w,y+h*.08],[x+w*.78,y+h*.60],[x-w*.68,y+h*.62]],"#3b553a","#354638");
      const rand = rng(seed);
      for (let i = 0; i < 29; i++) {
        const a = (rand()-.5)*1.88;
        const b = (rand()-.5)*1.6;
        if (a*a+b*b > .94) continue;
        rect(x+a*w,y+b*h,1.4+rand()*2.0,1+rand()*.9,["#7c9050","#a2a765","#627b45","#8b9c56"][i%4]);
      }
    }

    function bonsai(x,y) {
      const [px,py] = point(x,y);
      shadow(px,py+1,14,5,"#36352e64");
      roundVessel(x,y,.41,.28,0,4.6,["#57698d","#384862","#495a77","#405371","#303e59"]);
      poly(beveledRing(x,y,.35,.23,4.72),"#545b42","#73808b");
      const glazed = beveledRing(x,y,.405,.277,3.42);
      line([glazed[2],glazed[3],glazed[4],glazed[5]],"#aab9d08a",.56);
      rect(px-5.2,py-2.1,2.1,.5,"#91a8d2ac");
      for (const [a,b,w] of [[-5,-4.5,4],[2,-5,3],[-1,-2.8,3],[5,-4.4,2]]) rect(px+a,py+b,w,1.1,"#8e985b");
      const trunk = [[px-1,py-4],[px-4,py-10],[px+2,py-15],[px+.5,py-19],[px+4,py-25]];
      const branches = [
        [[px-2,py-11],[px-8,py-15],[px-12,py-16]],
        [[px+2,py-15],[px+10,py-17],[px+13,py-19]],
        [[px+1,py-20],[px-4,py-22],[px-8,py-22]],
        trunk
      ];
      for (const branch of branches) {
        line(branch,"#694535",2.8);
        line(branch.map(([a,b]) => [a-.4,b-.45]),"#a37250",.95);
      }
      mossCrown(px-10,py-16.3,8,3.1,73);
      mossCrown(px+11,py-18.75,8.15,3.25,84);
      mossCrown(px-6.2,py-22.15,7.0,3.05,92);
      mossCrown(px+3.2,py-26.35,8.15,3.8,107);
      line([point(x+.12,y+.27,3.5),point(x+.29,y+.22,3.5)],"#8390a7",.7);
    }

    function snakePlant(x,y) {
      const [px,py] = point(x,y);
      shadow(px,py+1,11,4.6,"#37332e61");
      const lip = roundVessel(x,y,.28,.27,0,10.8,["#c9bca2","#898475","#b2a893","#9c927e","#6e685e"]);
      for (const index of [2,3,4,5]) {
        const [a,b] = lip[index];
        const [c,d] = lip[index+1];
        for (const t of [.20,.43,.66,.89]) {
          const xx = a+(c-a)*t;
          const yy = b+(d-b)*t;
          line([[xx,yy+1.2],[px+(xx-px)*.89,yy+10.3]],"#e6d6af8b",.62);
        }
      }
      poly(beveledRing(x,y,.23,.21,10.92),"#504f3e","#d2c6a9");
      const base = py-11.2;
      for (const [start,tip,h,w,light] of [[-2,-10,16,2.1,false],[2,8,20,2.25,false],[-3,-6,23,2.5,true],
        [1,1,29,2.85,true],[3,11,23,2.35,true],[-1,-5,15,2.2,true],[4,6,14,1.8,false]]) {
        const mid = (start+tip)*.5;
        poly([[px+start-w,base+.4],[px+mid-w,base-h*.53],[px+tip,base-h],
          [px+mid+w,base-h*.59],[px+start+w,base+.15]],light ? "#597346" : "#405b3d", "#486043");
        line([[px+start-w+.15,base],[px+mid-w+.25,base-h*.53],[px+tip,base-h]],light ? "#c6b862" : "#87965c",.72);
        for (const band of [.27,.42,.58,.69]) {
          const a = start+(tip-start)*band;
          const yy = base-h*band;
          line([[px+a-w*.55,yy],[px+a+w*.68,yy-.6]],light ? "#819153" : "#698258",.68);
        }
      }
      line([lip[2],lip[3],lip[4],lip[5],lip[6]],"#cabc9e",.82);
    }

    function pothosLeaf(x,y,size,light) {
      const leaf = [[-2.3,-1.0],[-1.6,-2.15],[-.4,-2.15],[.1,-1.45],[.85,-2.1],[2,-1.55],[2.25,-.2],[.2,2.35],[-1.65,.65]];
      poly(leaf.map(([a,b]) => [x+a*size,y+b*size]),light ? "#9ea956" : "#66864a","#536b42");
      line([[x-.55*size,y-1.35*size],[x+.2*size,y+1.25*size]],light ? "#d1c56b" : "#a3a85b",.56);
    }

    function hangingPothos(x,y) {
      const cedar = ["#b2865c","#885c43","#674535"];
      for (const dx of [.14,1.21]) box(x+dx,y+.07,.12,.34,5.8,cedar,23.3);
      box(x,y,1.56,.51,2.0,cedar,28.8);
      box(x+.12,y+.07,1.29,.36,4.7,WOOD,30.8);
      face(x+.19,y+.12,1.15,.24,35.56,"#584e3d","#9e754d");
      line([point(x+.05,y+.515,30.15),point(x+1.51,y+.515,30.15)],"#d4a373",.75);
      for (const [dx,z,size] of [[.21,35.8,1.35],[.35,38.8,1.23],[.53,36.9,1.46],[.68,40.0,1.17],
        [.85,37.5,1.43],[1.03,39.5,1.16],[1.19,37.0,1.56],[1.35,36.0,1.15]]) {
        const [px,py] = point(x+dx,y+.28,z);
        pothosLeaf(px,py,size,Math.floor(dx*10)%2 === 1);
      }
      for (const [dx,len,turn] of [[.65,12,-1],[1.02,18,1],[1.36,15,1]]) {
        const [px,py] = point(x+dx,y+.51,35.5);
        line([[px,py],[px+turn*1.7,py+len*.45],[px-turn*.6,py+len*.75],[px+turn*2.1,py+len]],"#6c854e",.72);
        for (let i = 1; i <= 3; i++) {
          pothosLeaf(px + turn*(i%2 === 1 ? 2.8 : -.4),py+len*i/3,1.05-i*.085,i%2 === 0);
        }
      }
    }

    function decorGlow(x,y,radius,strength,z = 0,aspect = .54) {
      const [px,py] = point(x,y,z);
      ctx.save();
      ctx.translate(px,py);
      ctx.scale(1,aspect);
      const glow = ctx.createRadialGradient(0,0,0,0,0,radius);
      glow.addColorStop(0,`rgba(255,222,154,${strength})`);
      glow.addColorStop(.24,`rgba(255,196,111,${strength*.78})`);
      glow.addColorStop(.58,`rgba(246,155,79,${strength*.31})`);
      glow.addColorStop(1,"#eaa25600");
      ctx.fillStyle = glow;
      ctx.fillRect(-radius,-radius,radius*2,radius*2);
      ctx.restore();
    }

    function paperLantern(x,y) {
      box(x-.22,y-.13,.44,.30,2.2,["#966848","#724936","#553a33"],47.2);
      line([point(x,y,47.2),point(x,y,42.0)],"#644239",1.1);
      const [px,py] = point(x,y,32.8);
      decorGlow(x,y,29,.57,32.8,.83);
      decorGlow(x,y,11,.48,33.1,1.08);
      rect(px-3.1,py-9.75,6.2,2.6,"#6a4635");
      const bands = [[-8,4.3],[-6.1,5.4],[-4.2,6.4],[-2.3,6.9],[-.4,6.9],[1.5,6.65],[3.4,6.35],[5.3,5.45],[7.2,4.0]];
      for (const [yy,half] of bands) {
        const stripe = yy === 3.4;
        rect(px-half,py+yy,2*half,2.08,stripe ? "#8e392c" : "#b97d47");
        rect(px-half+.7,py+yy,2*half-1.4,1.65,stripe ? "#be5735" : "#f1b265");
        rect(px-half*.57,py+yy,half*1.09,1.4,stripe ? "#e17444" : "#ffdd95");
        if (!stripe) rect(px-half*.19,py+yy,half*.42,1.1,"#fff2bb");
      }
      rect(px-2.75,py+9,5.5,1.9,"#6c4636");
      rect(px+1.35,py+9.35,1,1,"#c99656");
    }

    function floorAndon(x,y) {
      const cedar = ["#996c4d","#6f4a36","#563e35"];
      const left = x-.29;
      const near = y-.29;
      shadow(...point(x,y,.04),10,4,"#41352f66");
      for (const [dx,dy] of [[0,0],[0,.48],[.48,0],[.48,.48]]) box(left+dx,near+dy,.10,.10,3.2,cedar);
      box(left-.035,near-.035,.65,.65,2.1,cedar,2.8);
      box(left+.03,near+.03,.52,.52,10.1,["#ffd395","#e9a35e","#eabc76"],4.9,"#916445");
      for (const [ax,ay,bx,by] of [[x-.23,y+.264,x+.23,y+.264],[x+.264,y+.23,x+.264,y-.23]]) {
        const paper = ctx.createLinearGradient(...point(ax,ay,14.8),...point(ax,ay,5.18));
        paper.addColorStop(0,"#e7a561");
        paper.addColorStop(.35,"#ffce84");
        paper.addColorStop(.62,"#ffedaa");
        paper.addColorStop(1,"#e9a761");
        poly([point(ax,ay,5.18),point(bx,by,5.18),point(bx,by,14.8),point(ax,ay,14.8)],paper);
      }
      for (const [dx,dy] of [[.025,.025],[.49,.025],[.025,.49],[.49,.49]]) box(left+dx,near+dy,.065,.065,10.25,cedar,4.8);
      for (const z of [8.3,11.7]) line([point(x-.25,y+.26,z),point(x+.26,y+.26,z),point(x+.26,y-.25,z)],"#8e5a3d",.9);
      line([point(x,y+.26,5.1),point(x,y+.26,14.8)],"#8e5a3d",.84);
      line([point(x+.26,y,5.1),point(x+.26,y,14.8)],"#8e5a3d",.84);
      box(left-.055,near-.055,.69,.69,1.75,cedar,15.0);
      box(left+.075,near+.075,.43,.43,1.65,["#b48558","#8c5e42","#694735"],16.75);
      line([point(x-.28,y+.33,16.25),point(x+.33,y+.33,16.25)],"#c59566",.77);
      for (const grain of [-.13,-.02,.11]) line([point(x-.15,y+grain,18.48),point(x+.18,y+grain,18.48)],"#72513e96",.52);
    }

    function candleLantern(x,y) {
      const cedar = ["#a27e60","#795b48","#60483d"];
      const brass = ["#bb985d","#9a733d","#82623f","#6a4b36","#5c4938"];
      shadow(...point(x,y,.04),10.5,4,"#42372958");
      for (const [u,v] of [[-.25,-.25],[.18,-.25],[-.25,.18],[.18,.18]]) box(x+u,y+v,.08,.08,6.8,cedar);
      box(x-.32,y-.31,.64,.62,1.8,cedar,6.65);
      roundVessel(x,y,.25,.235,8.5,1.5,brass);
      decorGlow(x,y,13,.47,14,.82);
      roundVessel(x,y,.115,.105,10,2.75,["#ffe2a8","#dca871","#efc18a","#b27c56","#9a7956"]);
      const [flameX,flameY] = point(x,y,14.3);
      dot(flameX,flameY,"#ffd99480",2.8);
      poly([[flameX,flameY-2],[flameX+1.1,flameY-.1],[flameX+.45,flameY+1.2],[flameX-.75,flameY+.8]],"#ffc66c");
      rect(flameX-.33,flameY-.3,.66,.92,"#fff2b5");
      const lower = beveledRing(x,y,.20,.188,10);
      const upper = beveledRing(x,y,.20,.188,17.6);
      for (let i = 2; i <= 5; i++) {
        poly([upper[i],upper[i+1],lower[i+1],lower[i]],"#dab17724");
        line([lower[i],upper[i]],i%2 ? "#e0b474" : "#84633e",.73);
      }
      line([lower[6],upper[6]],"#d1a066",.71);
      line([upper[4],lower[4]],"#ffdc988f",.68);
      roundVessel(x,y,.25,.23,17.55,1.2,brass);
      roundVessel(x,y,.18,.16,18.75,1.75,brass);
      const [px,py] = point(x,y,20.4);
      line([[px-1.6,py],[px-1.6,py-2],[px-.65,py-3],[px+.65,py-3],[px+1.6,py-2],[px+1.6,py]],"#d8b575",.72);
    }

    function tree(x, y, variant = 0, size = 1) {
      const [px, py] = point(x, y);
      const rand = rng(109 + variant * 56);
      const greens = variant > 10 ? ["#524252", "#765466", "#9b5d6a", "#b5727b", "#c38b85"]
        : variant % 2 ? ["#31493a", "#4c6747", "#63844b", "#8b9458", "#b09d63"]
          : ["#253e35", "#385b43", "#4d754a", "#6d9053", "#89a162"];
      shadow(px, py, 18 * size, 8 * size, "#3028204d");
      rect(px - 2 * size, py - 26 * size, 4 * size, 27 * size, "#5f4d3a");
      rect(px - size, py - 24 * size, 1 * size, 20 * size, "#88674e");
      for (let j = 0; j < 3; j++) {
        const height = 27 + j * 9;
        const radius = 16 - j * 2;
        const yy = py - height * size;
        const xx = px + (j % 2 === 0 ? 2 : -4) * size;
        shadow(xx, yy, radius * size, radius * .64 * size, greens[j]);
        for (let i = 0; i < 37; i++) {
          const dx = (rand() - .5) * radius * 1.8;
          const dy = (rand() - .5) * radius * 1.2;
          if (dx * dx / (radius * radius) + dy * dy / (radius * radius * .45) > .85) continue;
          rect(xx + dx * size, yy + dy * size, (2 + rand() * 4) * size, (2 + rand() * 2) * size, greens[(i + j) % greens.length]);
        }
      }
    }

    function sidewalk() {
      const rand = rng(4527);
      for (let x = -2; x < 26; x++) {
        for (let y = -1; y < 20; y++) {
          if (x >= 0 && x < 24 && y >= 0 && y < 18) continue;
          const returnWalk = x === -1 && y >= 7;
          const grass = !returnWalk && ((x < 1 && y < 14) || (x > 22 && y < 9));
          const choice = Math.floor(rand() * 3);
          const color = grass ? ["#314550", "#354a52", "#3b4b56"][choice] : ["#535e70", "#566377", "#586478"][choice];
          face(x, y, 1, 1, SIDEWALK_Z, color, grass ? "#2d414f" : "#404f65");
          if (grass) {
            const [px, py] = point(x + .5, y + .5, SIDEWALK_Z);
            for (let i = 0; i < 4; i++) rect(px + rand() * 16 - 8, py + rand() * 7 - 3, 2, 1, i % 2 ? "#63716c" : "#3e555f");
          } else if (rand() < .38) {
            const [px, py] = point(x + .35 + rand()*.28, y + .31 + rand()*.4, SIDEWALK_Z+.04);
            const w = 3.5 + rand()*5;
            shadow(px,py,w,1.15 + rand()*1.5,"#3447627a");
            rect(px-w*.65,py-.4,w*.84,.5,"#83a6bc8b");
            rect(px-w*.13,py+1.05,w*.57,.5,"#788fae7f");
          }
        }
      }
      for (const [x, y, s, hue] of [[25, 1, 1.1, 12], [25, 5, .9, 6]]) {
        furniture.push({ depth: x + y, paint: () => {
          ctx.save();
          ctx.translate(0, 19);
          ctx.globalAlpha = .77;
          tree(x, y, hue, s);
          ctx.restore();
        } });
      }
    }

    function woodInlay([x, y]) {
      const cx = x + .5;
      const cy = y + .5;
      const circle = (radius, z) => Array.from({length:20}, (_, i) => {
        const angle = Math.PI * i / 10;
        return point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z);
      });
      poly(circle(.65, .08), "#b78b62", "#73503c");
      poly(circle(.56, .10), "#e3be8a");
      poly(circle(.42, .12), "#c99d6e", "#f4d7a3");
      for (const offset of [-.29, -.095, .1, .28]) {
        const half = Math.sqrt(.4 * .4 - offset * offset);
        line([point(cx-half,cy+offset,.14),point(cx+half,cy+offset,.14)], "#8b634d70", .55);
        line([point(cx-half+.055,cy+offset+.036,.15),point(cx+half-.055,cy+offset+.036,.15)], "#f1c999", .55);
      }
    }

    function floor() {
      const rand = rng(6129);
      box(-.12,-.12,24.24,18.24,4,["#4e5862","#303846","#222d3c"],SIDEWALK_Z,"#252d3d");
      box(0,0,24,18,17,["#a29379","#4d535d","#3e4655"],-17,"#2a3441");
      for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 20; col++) {
          const x = col * 1.2;
          const y = row * 1.2;
          const tone = FLOOR[Math.floor(rand() * FLOOR.length)];
          face(x,y,1.2,1.2,0,tone,"#61574778");
          line([point(x+.07,y+.052,.02),point(x+1.12,y+.052,.02)], "#dac6a477", .55);
          line([point(x+.07,y+.10,.02),point(x+.07,y+1.1,.02)], "#d6ccbd39", .55);
          const specks = (row+col)%3 === 1 ? 4 : 6;
          for (let i = 0; i < specks; i++) {
            const [a,b] = point(x+.12+rand()*.93,y+.14+rand()*.92,.02);
            rect(a,b,i%3 === 0 ? 1.15 : .55,.52,["#645f5a41","#dac9b656","#897c715c"][i%3]);
          }
          if ((row*7+col*5)%8 === 2) {
            const u = .16 + rand()*.5;
            line([point(x+u,y+.83,.03),point(x+u+.15,y+.9,.03),point(x+u+.24,y+.9,.03)],"#d9c4a957",.53);
          }
        }
      }
      for (const [x,y,w,d] of [[0,0,24,.28],[0,17.72,24,.28],[0,0,.27,18],[23.73,0,.27,18]]) {
        face(x,y,w,d,.04,"#656063","#d0a370");
      }
      for (const z of [-14,-6,-2]) {
        line([point(0,18.012,z),point(24.012,18.012,z),point(24.012,0,z)],"#293442",1.05);
      }
      line([point(0,18,-3.65),point(24,18,-3.65),point(24,0,-3.65)],"#bd976c",1.1);
      for (const x of [2.9,6.6,10.3,14,17.7]) {
        poly([point(x,18.02,-12),point(x+1.5,18.02,-12),point(x+1.5,18.02,-7),point(x,18.02,-7)],"#303948","#647081");
        for (const z of [-10.8,-9.6,-8.4]) line([point(x+.12,18.025,z),point(x+1.38,18.025,z)],"#5f6872",.65);
      }
      const stepColors = ["#ceae86", "#9f7659", "#89644e"];
      box(-1.42, 6.59, .48, 1.82, 5.1, stepColors, -19, "#80634d");
      box(-.94, 6.59, .47, 1.82, 10.2, stepColors, -19, "#80634d");
      box(-.47, 6.59, .48, 1.82, 15.2, stepColors, -19, "#80634d");
      face(-.09, 6.59, .42, 1.82, .1, "#c89467", "#77523b");
      line([point(.11, 6.64, .13), point(.11, 8.36, .13)], "#e4bb84", 1.05);
      for (const [x,z] of [[-1.36,-13.8],[-.88,-8.7],[-.41,-3.7]]) {
        line([point(x,6.68,z), point(x,8.32,z)], "#ebd0a8", .8);
        line([point(x+.15,7.32,z),point(x+.15,7.89,z)], "#ffe2a8a8", .55);
      }
      face(21.45, 16.13, 2.1, 1.85, .1, "#887b9a", "#695e82");
      face(21.46, 17.82, 2.08, .17, .18, "#cf9f6f", "#806349");
      face(21.49, 18, 2.02, .48, -8.3, "#b9a48a", "#857563");
      face(21.49, 18.46, 2.02, .54, -18.4, "#beb8a5", "#8e9282");
      for (let i = 0; i < 8; i++) face(21.55 + i * .255, 17.07, .045, .68, .12, "#c5b1ca");
      const [checkoutX, checkoutY] = CHECKOUT;
      face(checkoutX + .09, checkoutY + .05, .83, .91, .1, "#c38862", "#874e3e");
      face(checkoutX + .18, checkoutY + .15, .65, .71, .11, "#d5a474", "#efd0a2");
      face(STAFF_CHECKOUT[0] - .10, STAFF_CHECKOUT[1] - .18, 1.02, 1.34, .12, "#547264", "#c7aa7e");
      face(STAFF_CHECKOUT[0] + .01, STAFF_CHECKOUT[1] - .06, .80, 1.10, .13, "#718c74", "#3e584d");
      line([point(20.86,13.86,.15),point(20.86,13.52,.15),point(20.78,13.62,.15)], "#dfd1a4", 1.05);
      for (const [x,y] of CHECKOUT_QUEUE) {
        face(x + .14,y + .14,.72,.72,.12,"#d8ae884d","#926747");
        line([point(x+.34,y+.41,.13),point(x+.5,y+.66,.13),point(x+.66,y+.41,.13)], "#eed4a6", 1.05);
      }
      line([point(22.09,3.95,.18),point(22.09,14.95,.18)], "#e6bb88a3", 1, [2.5, 2.5]);
      line([point(20.46,3.09,.18),point(22.92,3.09,.18),point(22.92,14.95,.18)], "#e6bb88a3", 1, [2.5, 2.5]);
      line([point(21.17,3.34,.18),point(21.42,3.5,.18),point(21.17,3.66,.18)], "#eed4a6", 1.05);
    }

    function floorAtmosphere() {
      ctx.save();
      face(0,0,24,18,0,"#00000000");
      ctx.clip();
      const ambient = ctx.createLinearGradient(310,130,505,425);
      ambient.addColorStop(0,"#20395686");
      ambient.addColorStop(.34,"#343e614e");
      ambient.addColorStop(.66,"#bda28420");
      ambient.addColorStop(1,"#233c607d");
      ctx.fillStyle = ambient;
      ctx.fillRect(0,0,WIDTH,HEIGHT);
      for (const [ax,ay,bx,by,x,y,w,d] of [
        [0,0,0,1.75,0,0,24,1.75], [0,0,1.54,0,0,0,1.54,18],
        [24,0,22.38,0,22.38,0,1.62,18], [0,18,0,16.51,0,16.51,24,1.49]
      ]) {
        const shade = floorGradient(ax,ay,bx,by);
        shade.addColorStop(0,"#202b4782");
        shade.addColorStop(.38,"#2b375044");
        shade.addColorStop(1,"#252d4700");
        face(x,y,w,d,.05,shade);
      }
      const [paperX,paperY] = SHOP_DECOR.paperLantern;
      const [candleX,candleY] = SHOP_DECOR.candleLantern;
      const warmPools = [[paperX,paperY+.67,72,.82,22,.41],
        [...SHOP_DECOR.floorAndon,53,.87,18,.49],[candleX,candleY+.17,33,.74,13,.52]];
      for (const [x,y,spread,soft,core,shine] of warmPools) {
        decorGlow(x,y,spread,soft);
        decorGlow(x,y,core,shine,0,.42);
        for (const [dx,dy,w] of [[-.22,.21,.24],[.14,.31,.22],[.41,-.02,.16],[-.38,.07,.20],[-.46,.64,.31],[.23,-.29,.24]]) {
          line([point(x+dx,y+dy,.06),point(x+dx+w,y+dy,.06)],"#ffe2ac87",.64);
        }
      }
      for (const [x,y] of [[11.04+CABINET_FRONT,CABINET_START+CABINET_HALF],[17.04+CABINET_FRONT,CABINET_START]]) {
        const cool = floorGradient(x,y,x+1.7,y);
        cool.addColorStop(0,"#79c6e64f");
        cool.addColorStop(.41,"#93cadd23");
        cool.addColorStop(1,"#6ea9cc00");
        poly([point(x,y+.08),point(x+1.7,y+.27),point(x+1.7,y+CABINET_HALF-.23),point(x,y+CABINET_HALF-.08)],cool);
      }
      ctx.restore();
    }

    function aisleThresholds() {
      for (let index = 0; index < cabinets.length - 1; index++) {
        const left = cabinets[index].x + CABINET_WIDTH + .05;
        const right = cabinets[index+1].x - .05;
        for (const y of [CABINET_START,CABINET_END]) {
          face(left,y-.044,right-left,.088,.065,"#4a4c577a");
          line([point(left+.03,y-.032,.072),point(right-.03,y-.032,.072)],"#ded0b18e",.63);
        }
      }
    }

    function bluePlaque([x, y], text, facing, width, height, size, inset, robotIcon = false) {
      const left = -width / 2;
      const top = -height / 2;
      ctx.save();
      ctx.transform(1,facing*V/U,0,1,snap(x),snap(y));
      rect(left + 1, top + 1, width + .8, height + 1, "#3427228a");
      rect(left, top, width, height, "#28364f");
      rect(left + 1, top + 1, width - 2, height - 2, "#426689");
      rect(left + 1.6, top + 1.35, width - 3.2, .7, "#7799b0");
      rect(left + 3, top + 3, width - 6, height - 6, "#d8b779");
      rect(left + 3.8, top + 3.8, width - 7.6, height - 7.6, inset);
      for (const side of [-1,1]) {
        const edge = side * (-left - 3.55);
        for (const end of [-1,1]) {
          const corner = end * (-top - 3.55);
          line([[edge-side*2.1,corner],[edge,corner],[edge,corner-end*2.1]], "#f2d191", .95);
          dot(edge-side*1.05, corner-end*1.05, "#e0b977", 1.1);
        }
        if (robotIcon) continue;
        const crest = edge - side * 2.25;
        poly([[crest,-2.25],[crest+1.45,0],[crest,2.25],[crest-1.45,0]], "#d8ac6d");
        rect(crest-.4,-.4,.8,.8,"#ffdd9c");
        if (width > 50) {
          for (const end of [-1,1]) {
            line([[crest,end*3.1],[crest-side*2.25,end*5],[crest-side*4.9,end*4.4],
              [crest-side*5.9,end*2.85],[crest-side*4.7,end*2.1]], "#cc9f63", .75);
            dot(crest-side*6.9, end*4.3, "#e1ba7c", 1.1);
          }
        }
      }
      if (robotIcon) {
        const gold = "#f6d59a";
        line([[0,-10.9],[0,-7.9]], gold, .95);
        dot(0,-11.1,gold,1.55);
        rect(-6.1,-8,12.2,7.7,gold);
        rect(-4.8,-6.8,9.6,4.8,"#31475e");
        rect(-3.2,-5.4,1.7,1.8,"#e6efdf");
        rect(1.5,-5.4,1.7,1.8,"#e6efdf");
        rect(-7.5,-5.9,1.4,3.5,"#d0a96a");
        rect(6.1,-5.9,1.4,3.5,"#d0a96a");
        rect(-3.7,-.1,7.4,1.25,"#d0a96a");
      }
      const baseline = robotIcon ? 7.25 : .25;
      ctx.font = `700 ${size}px "Kaiti SC","Songti SC","KaiTi","Noto Serif CJK SC","PingFang SC",serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#382622";
      ctx.fillText(text,.45,baseline+1);
      ctx.fillStyle = "#ffebbb";
      ctx.fillText(text,0,baseline);
      ctx.restore();
    }

    function rear() {
      wallRun("west", 0, 6.55);
      wallRun("west", 8.37, 18);
      wallRun("north", 0, 24);
      for (const [a, b] of [[1.1, 4.7], [6, 10.1], [16.7, 20.8]]) windowRun("north", a, b);
      windowRun("west", 1.2, 5.0);
      windowRun("west", 14.26, 17.45);
      bluePlaque(point(.06,11.75,31), "停靠位", -1, 32, 32, 8, "#344e68", true);
      wallPoster("west", 12.98, .54, 27, "#e1af76", "#9b6148");
      wallPoster("west", 13.64, .48, 27, "#ddd2a2", "#6e8a72");
      const fasciaAt = (x,z) => point(x,.06,z);
      poly([fasciaAt(10.52,19.9),fasciaAt(16.28,19.9),fasciaAt(16.28,51.2),fasciaAt(10.52,51.2)],"#455361","#373e4c");
      poly([fasciaAt(10.64,22.6),fasciaAt(16.16,22.6),fasciaAt(16.16,49.2),fasciaAt(10.64,49.2)],"#394858","#6a6e75");
      line([fasciaAt(10.58,20.7),fasciaAt(16.22,20.7)],"#d9a975",1.25);
      bluePlaque(point(13.4,.17,36), "Twilight Mart", 1, 94, 25, 11.2, "#594134");
      hangingPothos(...SHOP_DECOR.pothos);
      paperLantern(...SHOP_DECOR.paperLantern);
      poly([point(.02,6.53,49),point(.02,8.37,49),point(.02,8.37,57),point(.02,6.53,57)], "#8b6048", EDGE);
      line([point(.03,6.53,50),point(.03,8.37,50)], "#c09369", 1.1);
      eave("north", 24.18);
      poly([point(-.42,18,0),point(0,18,0),point(0,18,57),point(-.42,18,57)], "#805740", EDGE);
      line([point(0,18,0),point(0,18,56)], "#593c31", 2.3);
      line([point(-.15,18,15),point(-.15,18,53)], "#ba8863", .8);
      eave("west", 18.14);
      const hipStart = point(-.67,-.67,65.4);
      const hipEnd = point(.69,.69,55.6);
      line([hipStart,hipEnd], "#3b3443", 3.1);
      line([hipStart,hipEnd], "#77778c", 1.25, [5.2,1.4]);
    }

    function shelfPalette(style) {
      return SHELF_PALETTES[style] || WOOD;
    }

    function loaf(x, y, z, variation) {
      const h = variation ? 4 : 3.4;
      box(x, y, .44, .34, h, ["#de9b52", "#b9743e", "#8a4a2c"], z, "#75472d");
      const [px, py] = point(x + .21, y + .17, z + h);
      poly([[px - 5.7, py + .6], [px - 5.6, py - 1.3], [px - 3.1, py - 3.6], [px + 2, py - 4.2],
        [px + 5.4, py - 1.8], [px + 5.6, py + .3], [px + 2, py + 2.6]], "#f1b96a", "#9e6138");
      for (const dx of [-2.8, -.25, 2.3]) line([[px + dx, py - 2.15], [px + dx + 1.25, py + .2]], "#ffdf9d", .8);
      poly([[px+1.8,py-3.25],[px+3.7,py-2.6],[px+3.35,py+1.85],[px+1.45,py+2.4]],"#f5dbac9c");
      if (variation) line([point(x + .43, y + .08, z + 1), point(x + .43, y + .3, z + 1)], "#e9d0a1", .65);
    }

    function breadDisplay(x,y,amount,bay) {
      box(x,y+.015,CABINET_WIDTH,CABINET_BAY-.03,8,WOOD);
      box(x+.09,y+.05,1.12,CABINET_BAY-.11,12.5,WOOD,8);
      box(x+1.17,y+.05,1.26,CABINET_BAY-.11,7.4,WOOD,8);
      const deck = ["#d9ad76","#a78058","#8b633f"];
      box(x+.20,y+.09,.87,CABINET_BAY-.18,.95,deck,20.55);
      box(x+1.27,y+.09,.99,CABINET_BAY-.18,.95,deck,15.45);
      for (const grain of [.24,.48,.87]) {
        line([point(x+.30,y+grain,21.53),point(x+.98,y+grain,21.53)],"#9f744d72",.56);
        line([point(x+1.34,y+grain,16.43),point(x+2.17,y+grain,16.43)],"#9f744d78",.56);
      }
      for (const [slot,[row,column]] of [[1,0],[1,1],[0,0],[0,1]].entries()) {
        if (slot >= amount) break;
        loaf(x + (row ? 1.76 : .55),y+.23+column*.49,row ? 16.44 : 21.54,(bay+slot)%2);
      }
      const front = x + CABINET_FRONT;
      line([point(front,y+.05,5.85),point(front,y+CABINET_BAY-.07,5.85)],"#d8a771",.75);
      line([point(front-.10,y+.07,15.55),point(front-.10,y+CABINET_BAY-.08,15.55)],"#f6d397",.72);
    }

    function eggCarton(x, y, z, brown) {
      box(x,y,1.02,.86,2.2,["#b9b68f","#8e906b","#6a755a"],z,"#5f654d");
      face(x+.07,y+.07,.87,.72,z+2.24,"#8e9573","#d2d1a7");
      for (const yy of [.23,.62]) {
        for (let col = 0; col < 5; col++) {
          const [px,py] = point(x+.14+col*.183,y+yy,z+2.55);
          poly([[px-.8,py-2.05],[px+.85,py-2.05],[px+1.55,py-.95],[px+1.45,py+.55],
            [px+.72,py+1.2],[px-.78,py+1.2],[px-1.45,py+.48],[px-1.52,py-.88]],
          brown ? "#dfb082" : "#fff0cf", brown ? "#a6755a" : "#cbb494");
          rect(px-.64,py-1.65,.75,.65,brown ? "#f9d2a6" : "#fff9df");
        }
      }
    }

    function eggDisplay(x, y, amount, bay) {
      box(x,y+.02,CABINET_WIDTH,CABINET_BAY-.035,8,JADE);
      box(x+.08,y+.055,1.17,CABINET_BAY-.12,10,JADE,8);
      box(x+1.26,y+.055,1.17,CABINET_BAY-.12,6.35,JADE,8);
      face(x+.16,y+.13,1.02,.91,18.07,"#7a886e","#a9ae85");
      face(x+1.33,y+.13,1.03,.91,14.42,"#7a886e","#a9ae85");
      if (amount >= 1) eggCarton(x+1.36,y+.17,14.47,bay % 2 === 1);
      if (amount >= 2) eggCarton(x+.18,y+.17,18.12,bay % 2 !== 1);
      const front = x + CABINET_FRONT;
      line([point(front,y+.08,6.6),point(front,y+CABINET_BAY-.09,6.6)],"#c5c49c",.85);
      const [px,py] = point(front,y+.7,5.45);
      rect(px-2.2,py-.7,4.4,1.4,"#e4d5ab");
      rect(px-.9,py-.27,1.7,.55,"#8d795e");
    }

    function milkCarton(x, y, z, variation) {
      const width = .36;
      const depth = .43;
      const h = 5.4;
      const ink = ["#377ba8", "#5d91b4", "#4c918b"][variation % 3];
      const at = (u,v,height) => point(x+u,y+v,z+height);
      box(x, y, width, depth, h, ["#fff4da", "#e3ede0", "#c1dce0"], z, "#506c79");
      const seam = [at(0,depth/2,7.35), at(width,depth/2,7.35)];
      poly([at(0,0,h), at(width,0,h), seam[1], seam[0]], "#e7efe3", "#728d96");
      poly([seam[0], seam[1], at(width,depth,h), at(0,depth,h)], "#fdf4d8", "#728d96");
      poly([at(width,0,h), seam[1], at(width,depth,h)], "#c8e1de", "#728d96");
      line(seam, "#fff9df", .75);
      poly([at(width,.025,1.1),at(width,depth-.025,1.1),at(width,depth-.025,4.4),at(width,.025,4.4)], ink);
      poly([at(.025,depth,.9),at(width-.025,depth,.9),at(width-.025,depth,2.8),at(.025,depth,2.8)], ink);
      const [px, py] = at(width,depth/2,2.95);
      poly([[px,py-1.25],[px+.85,py-.1],[px+.55,py+.75],[px-.6,py+.75],[px-.85,py-.1]], "#fff6db");
      line([at(width,.04,4.65),at(width,depth-.04,4.65)], "#fff5d8", .65);
    }

    function drinkBottle(x, y, z, index) {
      const tones = [["#eb916a","#bd5742","#8b3f34"],["#f5c875","#d49244","#936634"],
        ["#acd58c","#719f56","#4a6847"],["#add9e2","#64a4b4","#427e8c"]];
      const type = index % tones.length;
      const tone = tones[type];
      const can = type === 0;
      const width = can ? .24 : .22;
      const height = can ? 4.6 : type === 3 ? 6 : 5.2;
      box(x, y, width, width, height, tone, z, tone[2]);
      if (can) {
        face(x+.025,y+.025,width-.05,width-.05,z+height+.025,"#d5cdc0",tone[2]);
        const [pullX,pullY] = point(x+.13,y+.11,z+height+.1);
        rect(pullX-.4,pullY-.35,.8,.7,"#948b82");
      } else {
        box(x+.039,y+.039,.14,.14,1.0,tone,z+height,tone[2]);
        const cap = [CREAM, WOOD, JADE, STEEL][type];
        box(x+.025,y+.025,.17,.17,.65,cap,z+height+.86,tone[2]);
      }
      const [px,py] = point(x+width,y+width/2,z+height*.5);
      rect(px-1.65,py-1.1,3.3,2.1,type === 3 ? "#d8f1ed" : "#ffebb7");
      rect(px-.68,py-.5,1.35,.65,tone[1]);
      line([point(x+width,y+.036,z+.45),point(x+width,y+.036,z+height-.45)],"#fff2cd76",.55);
    }

    function essentialPack(x, y, z, index) {
      const kind = index % 4;
      if (kind === 0) {
        box(x,y,.43,.34,3.1,["#c8b3cf","#a58eb1","#766783"],z,"#6b576f");
        const [px,py] = point(x+.20,y+.17,z+3.2);
        rect(px-2.4,py-.45,4.8,.9,"#6b576f");
        poly([[px-1.8,py],[px-1.8,py-2.3],[px+.3,py-4.1],[px+1.35,py-2.1],[px+2,py]],"#faf4df","#ddd1bd");
        return;
      }
      if (kind === 1) {
        for (const dy of [0,.17]) {
          box(x,y+dy,.25,.16,4.5,["#fff0d8","#e5d9c7","#bdb5a3"],z,"#92836f");
          const [px,py] = point(x+.13,y+dy+.08,z+4.6);
          rect(px-1.45,py-.7,2.9,1.35,"#fff5df");
          rect(px-.52,py-.47,1.05,.87,"#a89b83");
        }
        return;
      }
      if (kind === 2) {
        box(x,y,.29,.27,4.7, ["#b3d3ad","#88b39c","#5a887b"],z,"#4f7264");
        box(x+.06,y+.06,.15,.15,1.35,JADE,z+4.6);
        box(x+.035,y+.095,.23,.075,.55,CREAM,z+5.83);
        const [px,py] = point(x+.295,y+.135,z+2.1);
        rect(px-1.6,py-1.35,3.2,2.7,"#f3e8bc");
        return;
      }
      box(x,y,.29,.36,4.95,["#e7b59b","#cf947e","#a96c62"],z,"#945e56");
      const [px,py] = point(x+.29,y+.18,z+2.55);
      rect(px-2,py-1.8,4,3.6,"#f2d7af");
      rect(px-1.2,py-.8,2.4,.65,"#be816f");
      rect(px-.65,py+.3,1.3,.55,"#a57268");
    }

    function fruitTray(x, y, z, tint) {
      box(x, y, .46, .43, 2.2, ["#f4d8a1", "#d9b07f", "#ab8862"], z, "#926849");
      const palette = [["#d46b53", "#f0ae56", "#9ab165"], ["#f0a451", "#8aa861", "#e77c69"]][tint % 2];
      for (let i = 0; i < 8; i++) {
        const [px, py] = point(x + .092 + (i%4)*.087, y + (i < 4 ? .10 : .278), z + 2.48);
        rect(px - 1.0, py - .7, 1.9, 1.45, palette[i % 3]);
        rect(px - .5, py - .65, .8, .5, "#fff0b2");
      }
      line([point(x + .035,y+.405,z+2.7),point(x+.41,y+.405,z+2.7)], "#fff2c0", .65);
    }

    function fruitDisplay(x, y, amount) {
      const palette = FRUIT_SHELF;
      box(x, y + .02, CABINET_WIDTH, .95 + BAY_EXTENSION, 7, palette);
      box(x + .08, y + .06, 2.35, .85 + BAY_EXTENSION, 7, ["#f0cb91", "#b78a5f", "#a57753"], 7);
      box(x + .11, y + .08, .88, .82 + BAY_EXTENSION, 5, palette, 14);
      box(x + 1.02, y + .08, 1.27, .82 + BAY_EXTENSION, 3.3, palette, 14);
      for (const [start, z, slotsAhead] of [[x + .31, 19.1, 4], [x + 1.15, 17.4, 2], [x + 1.8, 17.4, 0]]) {
        for (let i = 0; i < 2 && slotsAhead+i<amount; i++) fruitTray(start,y+.15+i*.53,z,i+Math.floor(start*2));
      }
      box(x + 2.34, y + .04, .12, .88 + BAY_EXTENSION, 4, ["#f7d49c", "#c58a58", "#b1734d"], 15);
      const [px, py] = point(x + 2.45, y + .52, 15.5);
      rect(px - 2.5, py - .8, 5, 1.8, "#f3dbad");
      rect(px - 1, py - .3, 2, .5, "#a56c54");
    }

    function shelf(x, y, style, amount, bay) {
      const colors = shelfPalette(style);
      const chilled = style === "milk" || style === "drinks";
      const light = chilled ? "#c5dce4" : "#f2ca95";
      face(x - .13, y, CABINET_WIDTH + .23, 1.07 + BAY_EXTENSION, .01, "#52423827");
      if (style === "fruit") {
        fruitDisplay(x, y, amount);
        return;
      }
      if (style === "eggs") {
        eggDisplay(x, y, amount, bay);
        return;
      }
      if (style === "bread") {
        breadDisplay(x, y, amount, bay);
        return;
      }

      const height = CABINET_HEIGHT[style];
      const shelves = chilled ? [6, 15, 24] : [6, 15, 23];
      const product = { milk:milkCarton, drinks:drinkBottle, essentials:essentialPack }[style];
      const front = x + CABINET_FRONT;
      box(x, y + .015, CABINET_WIDTH, .97 + BAY_EXTENSION, 4, colors);
      box(x, y + .04, 1.01, .91 + BAY_EXTENSION, height - 4, colors, 3);
      for (const [level,z] of shelves.entries()) {
        box(x + .91, y + .06, CABINET_FRONT - .91, .87 + BAY_EXTENSION, 1.55, colors, z);
        if (style === "milk") {
          // Spread the first three products across the visible tiers without increasing stock.
          const rank = (level + bay) % shelves.length;
          for (let i = 0; i < 2; i++) {
            if (rank + i * shelves.length >= amount) break;
            const offset = amount <= shelves.length && rank > 0 ? .18 : 0;
            product(x + 2.11, y + .105 + i * .52 + offset, z + 1.6, bay + i + level);
          }
        } else {
          const count = chilled ? 3 : 2;
          const slotsAhead = count * (shelves.length - level - 1);
          for (let i = 0; i<count && slotsAhead+i<amount; i++) {
            const variant = (bay + z + i) % (style === "drinks" || style === "essentials" ? 4 : 2);
            product(x + (chilled ? 2.24 : style === "essentials" ? 2.04 : 1.83),
              y + .115 + i * (chilled ? .33 : .53), z + 1.6, variant);
          }
        }
        line([point(front, y + .065, z + 1.5), point(front, y + .94 + BAY_EXTENSION, z + 1.5)], light, .9);
        const [px, py] = point(front, y + .66, z + .5);
        rect(px - 2.1, py - .7, 3.8, 1.3, "#f4dfb4");
        rect(px - .9, py - .35, 1.45, .5, "#97765b");
      }

      if (chilled) {
        box(x, y + .02, CABINET_WIDTH, .94 + BAY_EXTENSION, 2.9, colors, height - 2.8);
        const topMetal = floorGradient(x,y,x+CABINET_WIDTH,y,height+.13);
        topMetal.addColorStop(0,style === "milk" ? "#607b96" : "#688d8e");
        topMetal.addColorStop(.34,style === "milk" ? "#8ca9ba" : "#94b5b3");
        topMetal.addColorStop(.66,style === "milk" ? "#88a8bd" : "#83a9ac");
        topMetal.addColorStop(1,style === "milk" ? "#a0b7c1" : "#a0bfb8");
        face(x+.11,y+.10,CABINET_WIDTH-.22,CABINET_BAY-.20,height+.13,topMetal,"#496879");
        line([point(x+.15,y+.15,height+.15),point(front-.15,y+.15,height+.15)],"#c9e1dd",.62);
        line([point(front-.11,y+.15,height+.15),point(front-.11,y+CABINET_BAY-.15,height+.15)],"#dae4d4",.58);
        for (const brushed of [.29,.46,.84]) {
          line([point(x+.18,y+brushed,height+.16),point(x+1.31,y+brushed,height+.16)],"#d4dfe244",.53);
        }
        const glass = [point(front, y + .065, 5), point(front, y + .94 + BAY_EXTENSION, 5),
          point(front, y + .94 + BAY_EXTENSION, height - 2), point(front, y + .065, height - 2)];
        const glazing = ctx.createLinearGradient(...point(front,y+.56,height-2),...point(front,y+.56,5));
        glazing.addColorStop(0,"#b7d6e244");
        glazing.addColorStop(.36,amount === 0 ? "#9fc0d22b" : "#a6d7e60e");
        glazing.addColorStop(.71,"#b0e3ee26");
        glazing.addColorStop(1,"#1c3d6954");
        poly(glass,glazing,"#9fcbdb");
        poly([point(front+.02,y+.15,height-5),point(front+.02,y+.26,height-5),
          point(front+.02,y+.56,12.8),point(front+.02,y+.49,12.8)],"#d1ecf12d");
        line([point(front + .02, y + .11, 26), point(front + .02, y + .28, 17)], "#e6f6ea61", .7);
        line([point(front + .02, y + .7, 21), point(front + .02, y + .7, 17.8)], "#edf2dd", 1.15);
        line([point(front, y + .08, height - 2.2), point(front, y + .92 + BAY_EXTENSION, height - 2.2)], "#cce6e8", .85);
        line([point(front, y + .12, height - 3.65),point(front, y + .87 + BAY_EXTENSION, height - 3.65)],"#bbd1d5",.8);
        line([point(front, y + .12, 5.32), point(front, y + .87 + BAY_EXTENSION, 5.32)], "#88aab8", .85);
        line([point(front+.015,y+.08,2.1),point(front+.015,y+CABINET_BAY-.08,2.1)],"#233b54",.75);
        for (const vent of [.18,.32,.46,.60,.74,.88,1.02]) {
          line([point(front+.018,y+vent,1.2),point(front+.018,y+vent,2.5)],"#7697a5",.50);
        }
      } else {
        box(x, y + .025, 1.17, .94 + BAY_EXTENSION, 2.45, colors, height - 2.4);
        line([point(x + 1.17, y + .07, height), point(x + 1.17, y + .92 + BAY_EXTENSION, height)], light, 1.05);
      }
    }

    function shelfEnd(x, y, style) {
      const colors = shelfPalette(style);
      box(x, y, CABINET_WIDTH + .02, .22, CABINET_HEIGHT[style], colors);
      const faceY = y+.225;
      const top = CABINET_HEIGHT[style]-3;
      const chilled = style === "milk" || style === "drinks";
      const inset = ctx.createLinearGradient(...point(x+1.25,faceY,top),...point(x+1.25,faceY,4));
      inset.addColorStop(0,chilled ? "#8baebb" : style === "essentials" ? "#a59aaa" : "#d99d73");
      inset.addColorStop(.43,chilled ? "#7297ac" : style === "essentials" ? "#9d92a6" : "#ca8a62");
      inset.addColorStop(1,chilled ? "#4a6b8a" : style === "essentials" ? "#746a8a" : "#935f4c");
      poly([point(x+.13,faceY,4),point(x+CABINET_WIDTH-.13,faceY,4),
        point(x+CABINET_WIDTH-.13,faceY,top),point(x+.13,faceY,top)],inset,colors[2]);
      line([point(x+.18,faceY,top-.65),point(x+CABINET_WIDTH-.18,faceY,top-.65)],"#f6deb08a",.78);
      line([point(x+.15,faceY,3),point(x+CABINET_WIDTH-.13,faceY,3)],"#f2d5a995",1);
      if (chilled) {
        for (const vent of [7,8.2,9.4]) line([point(x+.36,faceY+.01,vent),point(x+1.13,faceY+.01,vent)],"#486a80",.78);
      }
    }

    function cabinetBayPainter(x, y, half, bay) {
      const left = Math.floor(point(x-.24,y+CABINET_BAY+.23)[0] - 4);
      const right = Math.ceil(point(x+CABINET_WIDTH+.26,y-.22)[0] + 4);
      const top = Math.floor(point(x-.24,y-.22,40)[1] - 3);
      const bottom = Math.ceil(point(x+CABINET_WIDTH+.26,y+CABINET_BAY+.23)[1] + 3);
      let layer;
      let lastAmount;
      return view => {
        const stock = (view.worldStock || view.stock)?.[half.sku];
        const count = Number.isFinite(stock) ? Math.max(0,Math.floor(stock)) : Infinity;
        const amount = Number.isFinite(count) ? Math.floor(count / CABINET_BAYS_PER_HALF) + Number(bay < count % CABINET_BAYS_PER_HALF) : Infinity;
        if (amount !== lastAmount) {
          layer ||= document.createElement("canvas");
          layer.width = (right-left)*RASTER_SCALE;
          layer.height = (bottom-top)*RASTER_SCALE;
          const previous = ctx;
          ctx = layer.getContext("2d");
          try {
            ctx.setTransform(RASTER_SCALE,0,0,RASTER_SCALE,-left*RASTER_SCALE,-top*RASTER_SCALE);
            shelf(x,y,half.style,amount,bay);
            lastAmount = amount;
          } finally {
            ctx = previous;
          }
        }
        ctx.drawImage(layer,left,top,right-left,bottom-top);
      };
    }

    function mountedPlate(x, y, title, fill, edge, tilt = 0, size = 8.5) {
      ctx.save();
      ctx.translate(snap(x), snap(y));
      ctx.rotate(tilt);
      ctx.font = `700 ${size}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      const w = Math.ceil(ctx.measureText(title).width) + 8;
      rect(-w / 2, -5.5, w, 11, edge);
      rect(-w / 2 + 1, -4.5, w - 2, 9, fill);
      rect(-w / 2 + 2, -4.5, w - 4, .5, "#fff1c954");
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff6df";
      ctx.fillText(title, 0, .35);
      ctx.restore();
    }

    function cabinetPlate(x, first, half, view) {
      const colors = shelfPalette(half.style);
      const [px, py] = point(x + CABINET_WIDTH + .03, first + 2.27, half.style === "fruit" ? 9 : 11);
      mountedPlate(px, py, half.title, colors[2], "#4b4540", -Math.atan(V / U));
      const stock = view.worldStock || view.stock;
      const restock = half.sku && view.restock?.sku === half.sku ? view.restock.state : "none";
      const status = restock === "working" ? "#f8d282" : stock?.[half.sku] === 0 ? "#ef946e" : null;
      if (status) {
        const [dotX, dotY] = point(x + CABINET_WIDTH + .05, first + .52, 10);
        dot(dotX, dotY, "#654b3c", 3);
        dot(dotX, dotY, status, 2);
      }
      if (half.sku === "FRUIT" && view.promoActive) {
        const [sx, sy] = point(x + CABINET_WIDTH + .06, first + 3.8, 9);
        mountedPlate(sx, sy, "8折", "#9b673a", "#694c3b", -Math.atan(V / U), 7.5);
      }
    }

    function counterSlab(x, y, w, d) {
      face(x-.06,y-.06,w+.12,d+.12,.04,"#3e332c48");
      box(x, y, w, d, 11, COUNTER_BASE);
      box(x-.04, y-.04, w+.08, d+.08, 2, COUNTER_OAK, 11);
      const polished = floorGradient(x-.04,y,x+w+.04,y,13.04);
      polished.addColorStop(0,"#aa7850");
      polished.addColorStop(.38,"#d7aa72");
      polished.addColorStop(.77,"#e3bd86");
      polished.addColorStop(1,"#b78c65");
      face(x-.018,y+.018,w+.035,d-.035,13.04,polished);
      for (const grain of [.15,.36,.61,.84]) {
        const at = x+w*grain;
        line([point(at,y+.11,13.07),point(at+.02,y+d-.12,13.07)],"#8d634b66",.55);
      }
      line([point(x+.04,y+d+.05,10.1),point(x+w-.04,y+d+.05,10.1)],"#dfab76",1.05);
    }

    function checkoutCounter() {
      const { left:x, right:front, top:y, bottom:end } = CHECKOUT_COUNTER;
      counterSlab(x,y,front-x,end-y);
      poly([point(front,y+.08,3),point(front,end-.08,3),point(front,end-.08,10.6),point(front,y+.08,10.6)],
        "#634c49","#8c6f57");
      line([point(front,y+.1,9.9),point(front,end-.1,9.9)],"#e1ba7d",1.1);
      line([point(front,y+.1,3.4),point(front,end-.1,3.4)],"#aa835c",.7);
      for (const divider of [12.47,13.4,14.4,14.98]) {
        line([point(front,divider,3.8),point(front,divider,9.5)],"#9b765e",.68);
      }
      face(x+.08,12.02,.40,1.08,13.06,"#4d4944","#988068");
      for (const rib of [12.16,12.42,12.68,12.94]) line([point(x+.12,rib,13.11),point(front-.11,rib,13.11)], "#c1ac8d", .55);
      for (const bag of [13.18,13.43]) {
        box(x+.09,bag,.21,.18,2.6,CREAM,13,"#917254");
        line([point(x+.14,bag+.10,15.7),point(x+.25,bag+.10,15.7)],"#9b6a50",.55);
      }
      box(x+.085,14.12,.32,.40,1.35,STEEL,13);
      box(x+.10,14.15,.25,.23,2.6,DARK,14.35);
      const [screenX,screenY] = point(x+.35,14.3,17.3);
      rect(screenX-3,screenY-2.8,6,3.9,"#314859");
      rect(screenX-2.1,screenY-2.2,4.3,2.25,"#b4ebd3");
      box(front-.23,14.76,.18,.21,.72,TEAL,13);
      face(front-.20,14.81,.12,.11,13.8,"#d5f0d6");
      const [tx,ty] = point(front+.04,12.88,8.1);
      mountedPlate(tx,ty,"收银台","#554c59","#493a3d",-Math.atan(V/U),9.2);
    }

    function gateCanopy(at, width, height, exit) {
      const crest = exit ? 12.4 : 11.2;
      const ridgeV = .05;
      const frontRun = exit ? 1.02 : .89;
      const backRun = exit ? .74 : .49;
      const rows = exit ? 5 : 4;
      const columns = exit ? 10 : 9;
      const eaveZ = height + 2.15;
      const roofHalf = width + .26;
      const zAt = (u, t) => {
        const lift = Math.max(0, (Math.abs(u) - roofHalf * .75) / (roofHalf * .25));
        return eaveZ + crest * Math.pow(1 - t, 1.32) + lift * lift * (1.2 + t * 1.4);
      };
      const tile = (u,t,front = true) => at(u, ridgeV + (front ? frontRun : -backRun) * t, zAt(u,t));
      const shoulder = (front,t) => {
        const run = front ? frontRun : -backRun;
        return at(roofHalf - .10, ridgeV + run * t, zAt(roofHalf - .1,t) - .9);
      };

      poly([tile(-roofHalf,1,false),tile(roofHalf,1,false),tile(roofHalf,0),tile(-roofHalf,0)],"#51484b","#382f33");
      for (const t of [.28,.56,.82]) {
        line([tile(-roofHalf,t,false),tile(0,t,false),tile(roofHalf,t,false)],"#77665f",.7);
      }

      const gableBase = at(roofHalf-.10,ridgeV+frontRun, eaveZ - 2.65);
      const gableBack = at(roofHalf-.10,ridgeV-backRun,eaveZ - 2.65);
      poly([gableBack,shoulder(false,1),shoulder(false,.56),shoulder(false,0),shoulder(true,.56),shoulder(true,1),gableBase],
        "#e0cda6","#674a3b");
      line([gableBack,gableBase],"#72503e",1.4);
      line([at(roofHalf-.10,ridgeV,eaveZ - 2.65),shoulder(true,0)],"#9c6a4f",1.15);
      line([shoulder(false,1),shoulder(false,.53),shoulder(false,0),shoulder(true,.53),shoulder(true,1)],"#8c5e49",1.45);

      const rim = u => at(u,ridgeV+frontRun,zAt(u,1)-1.45);
      poly([tile(-roofHalf,1),tile(0,1),tile(roofHalf,1),rim(roofHalf),rim(0),rim(-roofHalf)],"#30282b","#35282c");
      const tileColors = ["#665a55", "#766861", "#6d605b", "#615652"];
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        for (let c = 0; c < columns; c++) {
          const left = -roofHalf + 2 * roofHalf * c / columns;
          const right = -roofHalf + 2 * roofHalf * (c + 1) / columns;
          const mid = (left + right) / 2;
          const inset = (right - left) * .13;
          poly([tile(left,t0),tile(right,t0),tile(right,t1-.04),tile(right-inset,t1),tile(left+inset,t1),tile(left,t1-.04)],
            tileColors[(c * 7 + r * 3 + Math.floor(c / 3)) % tileColors.length],"#403639");
          line([tile(mid - inset * .55,t0+.018),tile(mid - inset * .65,t1-.04)],"#a08d7c",.7);
          line([tile(left+inset,t1-.015),tile(right-inset,t1-.015)],"#352b30",.95);
        }
      }

      const ridge = u => at(u,ridgeV-.035,zAt(u,0)+.85);
      const curve = [-1,-.87,-.6,-.3,0,.3,.6,.87,1].map(part => ridge(part*roofHalf));
      line(curve,"#5f4239",2.7);
      line(curve,"#b1846a",1.0);
      for (const side of [-1,1]) {
        const u = side*roofHalf;
        const end = at(u+side*.12,ridgeV-.025,zAt(u,0)+2.8);
        line([ridge(u-side*.15),ridge(u),end],"#855d4a",2.1);
        line([ridge(u),end],"#d4a483",.85);
      }
    }

    function door(x, y, exit, open) {
      const at = (u,v,z) => exit ? point(x+u,y+v,z) : point(x+v,y+u,z);
      const gateBox = (u,v,w,d,h,colors,z = 0,border = EDGE) => exit
        ? box(x+u,y+v,w,d,h,colors,z,border) : box(x+v,y+u,d,w,h,colors,z,border);
      const height = exit ? 33 : 38;
      const outer = exit ? 1.35 : ENTRANCE.outer;
      const jamb = ENTRANCE.jamb;
      const inner = outer - jamb;

      // Stacked wooden feet and paired jambs frame the walk-through opening.
      for (const left of [-outer, inner]) {
        gateBox(left-.04,-.17,jamb+.08,.46,2.6,COUNTER_BASE);
        gateBox(left,-.13,jamb,.39,height,DOOR_TIMBER);
        gateBox(left-.025,-.15,jamb+.05,.43,1.25,DOOR_TRIM,height-5);
        line([at(left+.06,.27,3),at(left+.06,.27,height-6)],"#d5a579",.85);
        line([at(left+.14,.27,5),at(left+.14,.27,height-7)],"#e2b98875",.55);
        const [px,py] = at(left+.11,.3,exit ? 11 : 18);
        if (exit) {
          dot(px,py,"#513b37",2.5);
          dot(px,py,open ? "#c0e5ad" : "#e4b485",1.5);
        }
      }

      // Cream lattice leaves sit in their pockets, outside the clear aperture.
      const pane = exit ? .28 : .37;
      const panelBottom = exit ? 4.0 : 5.0;
      const panelTop = exit ? 20.5 : 31;
      for (const [a,b] of [[-outer-pane,-outer+.02],[outer-.02,outer+pane]]) {
        const front = .13;
        poly([at(a,front,panelBottom),at(b,front,panelBottom),at(b,front,panelTop),at(a,front,panelTop)],"#dac49a","#6e4f3d");
        poly([at(a+.05,front,panelBottom+1.4),at(b-.05,front,panelBottom+1.4),at(b-.05,front,panelTop-1.4),at(a+.05,front,panelTop-1.4)],"#f3dfa9b8","#a47b58");
        for (let i = panelBottom+4.2; i < panelTop-1; i += 4.2) {
          line([at(a,front,i),at(b,front,i)],"#a17a58",.72);
        }
        line([at((a+b)/2,front,panelBottom+.8),at((a+b)/2,front,panelTop-.8)],"#98704f",.68);
      }

      gateBox(-outer-.1,-.23,2*outer+.2,.57,4.2,DOOR_TIMBER,height-2.7);
      gateBox(-outer-.21,-.27,2*outer+.42,.66,1.65,DOOR_TRIM,height+1.4);
      line([at(-outer-.11,.39,height+2.9),at(outer+.11,.39,height+2.9)],"#e6b991",.85);
      gateCanopy(at, outer, height, exit);
      bluePlaque(at(0,.82,height-4.4), exit ? "出口" : "入口", exit ? 1 : -1,
        exit ? 35 : 33, 16, 10, exit ? "#6d4437" : "#5d4637");
      if (exit && !open) {
        for (const [a,b] of [[-inner,-.17],[.17,inner]]) {
          line([at(a,.17,7),at(b,.17,7)],"#6d4f42",2.05);
          line([at(a,.19,7.65),at(b,.19,7.65)],"#d8a36e",.85);
        }
      }
    }

    function waitPlaque() {
      const [x,y] = ROBOT_WAIT;
      const centerX = x - .72;
      const baseY = y + 1.76;
      box(centerX-.7, baseY, 1.4, .24, 1.5, COUNTER_BASE);
      for (const dx of [-.55,.48]) box(centerX+dx,baseY+.03,.1,.13,10,DOOR_TIMBER,1.4);
      bluePlaque(point(centerX,baseY+.18,21.5), "等候区", 1, 32, 32, 8, "#344e68", true);
    }

    function baskets(x, y) {
      for (let i = 0; i < 3; i++) {
        box(x + i * .1, y + i * .08, .5, .56, 2.8, i % 2 ? JADE : RUST, i * 2);
      }
      face(x + .25, y + .24, .28, .31, 6.9, "#584f45", "#db9b72");
    }

    function exitIsOpen(view) {
      const robotCrossing = view.phaseCode === "EXIT" && view.paid && view.target?.label === "已离店";
      const shopperCrossing = (view.pedestrians || []).some(person =>
        person.stage === "exit" && Math.abs(person.x - EXIT[0]) < .6 && person.y >= 16 && person.y <= 18.1);
      return robotCrossing || shopperCrossing;
    }

    function cacheAndon() {
      const [x,y] = SHOP_DECOR.floorAndon;
      const [px,py] = point(x,y);
      const left = Math.floor(px-16);
      const top = Math.floor(py-25);
      const width = 32;
      const height = 34;
      const layer = document.createElement("canvas");
      layer.width = width*RASTER_SCALE;
      layer.height = height*RASTER_SCALE;
      const previous = ctx;
      ctx = layer.getContext("2d");
      try {
        ctx.setTransform(RASTER_SCALE,0,0,RASTER_SCALE,-left*RASTER_SCALE,-top*RASTER_SCALE);
        floorAndon(x,y);
      } finally {
        ctx = previous;
      }
      return () => ctx.drawImage(layer,left,top,width,height);
    }

    function staticScene() {
      ctx = world;
      ctx.save();
      ctx.shadowColor = "#0e182a90";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      face(-1.91, -.92, 27.81, 20.81, SIDEWALK_Z, "#1520335e");
      ctx.restore();
      sidewalk();
      ctx.save();
      ctx.shadowColor = "#13223e8c";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      face(.04, .04, 23.91, 17.91, -19, "#4e37294d");
      ctx.restore();
      floor();
      floorAtmosphere();
      aisleThresholds();
      woodInlay(DOCK);
      woodInlay(ROBOT_WAIT);
      rear();
      bonsai(...SHOP_DECOR.bonsai);
      snakePlant(...SHOP_DECOR.snakePlant);
      candleLantern(...SHOP_DECOR.candleLantern);
      for (const {x, halves} of cabinets) {
        const farEdge = x+CABINET_WIDTH;
        const shade = floorGradient(farEdge,CABINET_START,farEdge+.73,CABINET_START);
        shade.addColorStop(0,"#22294075");
        shade.addColorStop(1,"#333d5500");
        face(x-.09,CABINET_START+.03,CABINET_WIDTH + .44,2*CABINET_HALF+.15,.02,"#3431453e");
        face(farEdge-.03,CABINET_START+.09,.76,2*CABINET_HALF+.17,.021,shade);
        halves.forEach((half, index) => {
          const first = CABINET_START + index * CABINET_HALF;
          for (let bay = 0; bay < CABINET_BAYS_PER_HALF; bay++) {
            const y = first + bay * CABINET_BAY;
            furniture.push({ depth: x + y + 1.7, paint:cabinetBayPainter(x,y,half,bay) });
          }
          furniture.push({ depth:x + first + CABINET_HALF, paint:view => cabinetPlate(x, first, half, view) });
        });
        furniture.push({ depth:x + CABINET_END + 1.35, paint:() => shelfEnd(x, CABINET_END - .22, halves[1].style) });
      }
      furniture.push({ depth: 9.5, paint: () => baskets(.28, 8.46) });
      furniture.push({ depth: ENTRANCE.depth, paint: () => door(ENTRANCE.x, ENTRANCE.y, false, true) });
      furniture.push({ depth: 25.1, paint: waitPlaque });
      furniture.push({ depth: 29.3, paint:cacheAndon() });
      furniture.push({ depth:CHECKOUT_COUNTER.depth, paint:checkoutCounter });
      furniture.push({ depth: 40.3, paint: view => door(22.50, 17.48, true, exitIsOpen(view)) });
    }

    function groundMarkers(view) {
      for (const {point:position, color, edge} of shopMarkers) {
        const [x,y] = position;
        face(x + .11, y + .11, .78, .78, .08, color + "61", edge + "bc");
        face(x + .22, y + .22, .56, .56, .1, "#e8e4bb28", "#f7e2b699");
      }
      if (view.showGrid) {
        for (let x = 1; x <= 22; x++) {
          for (let y = 1; y <= 16; y++) {
            const atCounter = (x === 21 && y >= 11 && y <= 15) || (x === 20 && y === 12);
            const allowed = !atCounter && !SHELF_BOUNDS.some(([left,right,top,bottom]) =>
              x >= left - 1 && x <= right + 1 && y >= top - 1 && y <= bottom + 1);
            face(x + .04, y + .04, .92, .92, .1, allowed ? "#d8efb826" : "#6e39282e", allowed ? "#e1edca6b" : "#79483261");
            if (allowed && (x + y) % 3 === 0) {
              const [a, b] = pos([x, y], .1);
              rect(a, b, 1, 1, "#486e61aa");
            }
          }
        }
      }
      for (const blocked of view.routeReason?.blocked || []) {
        if (!blocked) continue;
        const {x, y} = xy(blocked);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        face(x + .04, y + .04, .92, .92, .19, "#ac654533", "#b76e54");
      }
      // From this camera angle the outside approach is behind the entry wall.
      const visiblePoint = p => p && !(view.entryStart && p.x < 0 && Math.abs(p.y - START[1]) < .18);
      const priorRoute = (view.priorRoute || []).filter(visiblePoint).map(p => groundPos(p, .95));
      const trail = (view.trail || []).filter(visiblePoint).map(p => groundPos(p, .8));
      if (trail.length > 1) {
        line(trail, "#536a766b", 5);
        line(trail, "#98bdc3", 2, [2, 4]);
      }
      if (priorRoute.length > 1) {
        line(priorRoute, "#665e58af", 3.2, [4, 4]);
        line(priorRoute, "#eee2c1", 1.15, [4, 4]);
      }
      drawRoute((view.route || []).filter(visiblePoint));
      const previous = view.routeReason?.previousTarget;
      if (previous) {
        const {x, y} = xy(previous);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          face(x + .13, y + .13, .74, .74, .7, "#544e4935", "#756e62");
        }
      }
      if (view.target && view.robotVisible !== false) {
        const { x, y } = xy(view.target);
        face(x + .08, y + .08, .84, .84, groundHeight(view.target) + 1.2, "#c4e49751", "#f5f0ba");
      }
    }

    function drawRoute(points) {
      const highlighted = path => {
        const screenPath = path.map(p => groundPos(p, 1));
        line(screenPath, "#385849bc", 5);
        line(screenPath, "#ddf5a9", 2.25, [6, 3]);
      };
      const westCorner = points.findIndex((point, i) => {
        const next = points[i+1];
        return point.x < 0 && next?.x === point.x && point.y >= WEST_OCCLUSION_BOTTOM && next.y <= WEST_OCCLUSION_TOP;
      });
      if (westCorner < 0) return highlighted(points);
      // The west-side sidewalk is behind the solid wall in this camera angle.
      const x = points[westCorner].x;
      const from = { x, y:WEST_OCCLUSION_BOTTOM };
      const to = { x, y:WEST_OCCLUSION_TOP };
      highlighted([...points.slice(0,westCorner+1),from]);
      line([groundPos(from,1),groundPos(to,1)], "#684b43b8", 3.1, [2.5,3.6]);
      line([groundPos(from,1),groundPos(to,1)], "#f2cd98bb", 1.45, [2.5,3.6]);
      highlighted([to,...points.slice(westCorner+1)]);
    }

    function sceneBadge(position, text, fill, edge, height, shift = 0) {
      const [baseX, y] = groundPos(position, height);
      const x = baseX + shift;
      ctx.font = '700 8.5px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      const width = Math.ceil(ctx.measureText(text).width) + 10;
      const left = Math.round(x - width / 2);
      rect(left, y - 5.5, width, 11, edge);
      rect(left + 1, y - 4.5, width - 2, 9, fill);
      ctx.fillStyle = "#48362d";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(text, Math.round(x), Math.round(y));
    }

    function showStoreEvents(view) {
      if (!view.showLabels) return;
      const labels = { pick:"选货", pay:"付款" };
      for (const shopper of view.pedestrians || []) {
        if (labels[shopper.stage]) sceneBadge(shopper, labels[shopper.stage], "#eadabe", "#7a6753", 30);
      }
      const waiting = view.checkoutQueue?.waiting || 0;
      if (waiting) sceneBadge(CHECKOUT_QUEUE[1], "排队 " + waiting + " 人", "#e9d1a9", "#8f6d4e", 29, 27);
      if (view.staff?.role === "restock") sceneBadge(view.staff, "补货", "#f3cd86", "#8f633f", 36, -10);
    }

    function mapFlag(position, name, palette, active = false) {
      const [x, y] = groundPos(position, active ? 29 : 18);
      const width = active ? 11 : name.length * 4.6 + 10;
      const h = active ? 10 : 12;
      const bg = active ? "#e9f1b6" : palette;
      const left = x - width / 2;
      rect(left, y - h / 2, width, h, "#524a3b");
      rect(left + 1, y - h / 2 + 1, width - 2, h - 2, bg);
      poly([[x - 3, y + h / 2 - 1], [x + 3, y + h / 2 - 1], [x, y + h / 2 + 3]], bg, "#524a3b");
      if (active) {
        rect(x - 1, y - 1, 3, 3, "#58764e");
      } else {
        mark(x, y + .5, name, "#564b3d", 7);
      }
    }

    function robotMarker(position, phase) {
      const [x, y] = groundPos(position, 44);
      const pause = /等待|避让|停车|人工/.test(phase || "");
      const light = pause ? "#fac3a0" : "#e3f3b0";
      poly([[x - 6, y - 3], [x + 6, y - 3], [x + 6, y + 1], [x, y + 6], [x - 6, y + 1]], "#345482", "#eee2b6");
      rect(x - 2, y - 1, 5, 1, light);
      rect(x - 1, y, 3, 1, light);
      rect(x, y + 1, 1, 1, light);
    }

    function paintThroughEntrance(paintRobot) {
      const front = ENTRANCE.x + .26;
      const halfOpening = ENTRANCE.outer - ENTRANCE.jamb - .05;
      const top = ENTRANCE.y - halfOpening;
      const bottom = ENTRANCE.y + halfOpening;
      // Reveal the robot through the clear opening below the hanging sign.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...point(front, top, 28));
      ctx.lineTo(...point(front, bottom, 28));
      ctx.lineTo(...point(front, bottom));
      ctx.lineTo(...point(front, top));
      ctx.closePath();
      ctx.clip();
      paintRobot();
      ctx.restore();
    }

    function draw(view = {}, now = 0) {
      const { width, height, fit, centerX, centerY } = fitSurface();
      const zoom = Math.min(1.68, Math.max(1, Number(view.zoom) || 1));
      const scale = fit*zoom;
      const robotPos = xy(view.position || START);
      const onEntryApproach = view.entryStart && Math.abs(robotPos.y - START[1]) < .18;
      const behindEntrance = onEntryApproach && robotPos.x < -1;
      const inEntrance = onEntryApproach && robotPos.x < .18;
      const entranceClear = !onEntryApproach || robotPos.x >= .6;
      const robotVisible = view.robotVisible !== false && !behindEntrance;
      const manualStaff = view.staff?.role === "handoff" ? view.staff : null;
      const focus = manualStaff || (robotVisible ? view.position || START : null);
      const p = focus ? groundPos(focus) : [centerX,centerY];
      const maxPanX = Math.max(0,(VIEW_BOUNDS.right-VIEW_BOUNDS.left-width/scale)/2);
      const maxPanY = Math.max(0,(VIEW_BOUNDS.bottom-VIEW_BOUNDS.top-height/scale)/2);
      const cx = view.follow ? Math.min(centerX+maxPanX,Math.max(centerX-maxPanX,p[0])) : centerX;
      const cy = view.follow ? Math.min(centerY+maxPanY,Math.max(centerY-maxPanY,p[1])) : centerY;
      ctx = screen;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ambience,0,0);
      ctx.scale(canvas.width/width,canvas.height/height);
      ctx.translate(width/2,height/2);
      ctx.scale(scale,scale);
      ctx.translate(-cx, -cy);
      ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
      if (view.promoActive) {
        face(4.96, 7.98, 2.02, 3.99, .05, "#ffd58236", "#e8be835d");
      }
      groundMarkers(view);
      const dynamic = furniture.slice();
      (view.pedestrians || []).forEach((p, i) => {
        dynamic.push({ depth:actorDepth(xy(p),1), paint: () => person(p, p.variant ?? i, view.peopleTimeMs ?? view.timeMs ?? now, false, now) });
      });
      const restock = view.restock;
      const stockActive = restock?.state === "working" && Number.isFinite(restock.x) && Number.isFinite(restock.y);
      if (stockActive) {
        dynamic.push({ depth:actorDepth(restock,1.65), paint: () => restocker(restock, view.timeMs ?? now, now) });
      } else {
        const staff = manualStaff || view.staff || { x:STAFF_CHECKOUT[0], y:STAFF_CHECKOUT[1] };
        dynamic.push({ depth:actorDepth(staff,1), paint:() =>
          person({ ...staff, stage:staff.stage || "checkout" }, 0, view.peopleTimeMs ?? view.timeMs ?? now, true, now) });
      }
      robotAnchor = null;
      if (robotVisible && entranceClear) {
        const [anchorX, anchorY] = groundPos(robotPos, 52);
        robotAnchor = { x:.5 + (anchorX-cx)*scale/width, y:.5 + (anchorY-cy)*scale/height };
      }
      const returnPhase = /先让行/.test(view.status || "") ? "返航等待" : "正在返航";
      const robotPhase = manualStaff ? "人工接手 · 机器人已停车" : view.returning ? returnPhase : view.phase;
      const robotBehindWall = robotVisible && view.returning && behindWestWall(robotPos);
      const paintRobot = () => robot({ ...view, phase:robotPhase, robotRenderZ:groundHeight(robotPos) }, view.timeMs ?? now);
      if (robotVisible && !robotBehindWall) {
        const depth = actorDepth(robotPos,1.1);
        dynamic.push(inEntrance
          ? { depth:Math.max(ENTRANCE.depth+.01,depth), paint:() => paintThroughEntrance(paintRobot) }
          : { depth, paint:paintRobot });
      }
      dynamic.sort((a, b) => a.depth - b.depth);
      for (const sprite of dynamic) sprite.paint(view);
      if (robotBehindWall) {
        ctx.save();
        ctx.globalAlpha = .39;
        paintRobot();
        ctx.restore();
        sceneBadge(robotPos, "墙外人行道", "#e9d1a9", "#8f6d4e", -8, 12);
      }
      if (robotVisible && view.target && view.showLabels) mapFlag(view.target, "", "#e9f1b6", true);
      showStoreEvents(view);
      if (robotVisible && entranceClear) robotMarker(robotPos, robotPhase);
      if (manualStaff && view.active) {
        const caption = view.handoff === "transfer" ? "交接购物篮" : manualStaff.carrying ? "店员接手" : "店员前往接手";
        sceneBadge(manualStaff, caption, "#f3cd86", "#775338", 39);
      }
      ctx.restore();
    }

    staticScene();
    return { draw, getRobotAnchor: () => robotAnchor };
  }

  window.PixelStoreArt = { create };
})();

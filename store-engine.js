(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.PixelStoreEngine = engine;
})(globalThis, function () {
  'use strict';

  // Exact split thresholds and leaf scores from synthetic-stockout-cart-v1.
  const CART = ["current_stock",5.5,["current_stock",3.5,["restock_eta_minutes",6.5,0.39106145251396646,0.8266953713670614],["sales_15m",5.5,0.25956284153005466,0.5866666666666667]],["current_stock",7.5,["sales_15m",9.5,0.15862068965517243,0.5882352941176471],["sales_15m",9.5,0.013193116634799235,0.2033195020746888]]];
  const MODEL_VERSION = 'synthetic-stockout-cart-v1';
  const MODEL_INFO = Object.freeze({
    version: MODEL_VERSION,
    sha256: 'ba217c624d733f49342097f5c46ee65baeeb81431154f998c17648c038d96fc7',
    features: Object.freeze(['current_stock', 'sales_15m', 'promo', 'hour', 'restock_eta_minutes', 'eta_missing']),
    threshold: 0.70,
    horizonMinutes: 10,
    label: '当前有货时，未来 10 个逐分钟模拟库存记录中至少一次为零'
  });
  const CELL_METERS = 0.5;
  const SPEED = 0.6;
  const QUEUE_SPEED = SPEED / 2;
  const TICK = 100;
  const START_MIN = 17 * 60 + 50;
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const PROMO_START = 10 * MINUTE;
  const PROMO_END = 130 * MINUTE;
  const LOAD_MAX = 3000;
  const PICK_MS = 30 * SECOND;
  const ROBOT_CHECKOUT_MS = 30 * SECOND;
  const SHOPPER_CHECKOUT_MS = 8 * SECOND;
  const FRESH_MS = 10 * MINUTE;
  const WAIT_MS = 180 * SECOND;
  const STOCK_WORK_MS = 30 * SECOND;
  const GATE_MS = 10 * SECOND;
  const SAFE_MARGIN = 30 * SECOND;
  // The report's staff handoff estimate is used for waiting decisions only.
  const WAIT_HANDOFF_ESTIMATE = MINUTE;
  const WIDTH = 24;
  const HEIGHT = 18;
  const ENTRY = { x: 1, y: 7, label: '入口' };
  const DOCK = { x: 1, y: 10, label: '机器人停靠位' };
  const EXIT = { x: 22, y: 16, label: '出口闸机' };
  const ENTRY_THRESHOLD = { x: 0, y: ENTRY.y };
  const DOCK_ENTRY_ROUTE = [DOCK, { x: DOCK.x, y: 9 }, { x: DOCK.x, y: 8 }, ENTRY];
  const OUTSIDE_ENTRY_ROUTE = [{ x: -2, y: ENTRY.y }, { x: -1, y: ENTRY.y }, ENTRY_THRESHOLD, ENTRY];
  const EXIT_THRESHOLD = { x: EXIT.x, y: 17 };
  const OUTSIDE = { x: EXIT.x, y: 18, label: '已离店' };
  const CASHIER = { x: 22, y: 14, label: '结账台' };
  const WAIT_POINT = { x: 8, y: 15, label: '等候区' };
  const STAFF_COUNTER = { x: 19.95, y: 14 };
  const STAFF_CLEARANCE = 0.85;
  const QUEUE_SEATS = [11, 8, 5].map(y => ({ x: CASHIER.x, y }));
  const QUEUE_APPROACH = { x: 20, y: 3, label: '排队入口' };
  const SHELVES = [5, 11, 17].map(x => [x, x + 1, 4, 11]);
  // Cabinet faces span actor y=2.79..12.23. Leave room at both mouths for
  // the full sprite to clear the shelves before the next person comes in.
  const AISLE_TOP = 2.39;
  const AISLE_BOTTOM = 12.63;
  // Actor coordinates are tile centers, half a tile inside the artwork grid.
  const COUNTER_BOUNDS = { x: [20.50, 21.22], y: [11.33, 14.72] };
  const COUNTER_CLEARANCE = 0.4;

  const products = {
    MILK: { sku: 'MILK', name: '常温奶', unit: '盒', price: 18, weight: 1000, x: 14, y: 10, color: '#6795b7' },
    EGG: { sku: 'EGG', name: '鸡蛋', unit: '盒', price: 16, weight: 600, x: 8, y: 5, color: '#c7975d' },
    FRUIT: { sku: 'FRUIT', name: '鲜切水果', unit: '盒', price: 30, weight: 500, x: 8, y: 10, color: '#c86e62' },
    BREAD: { sku: 'BREAD', name: '面包', unit: '袋', price: 12, weight: 400, x: 14, y: 5, color: '#b78a52' }
  };
  const SKUS = Object.keys(products);
  const names = sku => products[sku].name;
  const presets = {
    showcase: { name: '综合演示', detail: '17:58 入店。顾客在场、牛奶缺货，18:00 水果八折。补货加速至 90 秒。', items: { EGG: 1, MILK: 1, FRUIT: 1 }, start: 8 * MINUTE, leaveBy: '18:10' },
    normal: { name: '正常购物', detail: '货架有货，按自选清单走完购物流程。', items: { EGG: 1, MILK: 1 }, start: 0, leaveBy: '18:10' },
    restock: { name: '缺货后补齐', detail: '选定商品补货需 120 秒，机器人稍后回货架复核。', items: { EGG: 1, MILK: 1 }, start: 0, leaveBy: '18:10' },
    late: { name: '补货延迟', detail: '选定商品补货需 360 秒，机器人等到上限后会询问是否删减。', items: { EGG: 1, MILK: 1 }, start: 0, leaveBy: '18:10' },
    promo: { name: '晚间促销', detail: '17:58 入店，比较直接取货和等到 18:00 八折。', items: { FRUIT: 1 }, start: 8 * MINUTE, leaveBy: '18:10' },
    crowd: { name: '行人避让', detail: '先演示行人横穿，再按固定种子生成人流。', items: { EGG: 1, MILK: 1 }, start: 0, leaveBy: '18:10' },
    handoff: { name: '员工接手', detail: '固定客流演示停车、员工接篮、补取和结账离店。', items: { EGG: 1, BREAD: 1, MILK: 1 }, start: 0, leaveBy: '18:10' },
    compare: { name: '决策树对照', detail: '同单对照 CART 与库存规则，看看先去哪一站。', items: { EGG: 1, MILK: 1 }, start: 0, leaveBy: '18:10' }
  };
  const PHASE = {
    IDLE: '等待下单', ENTER: '前往入口点', MINE: '确认推荐', PLAN: '规划路线', MOVE: '前往目标',
    YIELD: '正在避让', PICK: '核验并取货', WAIT: '正在等待', WAIT_CONFIRM: '等待确认',
    CHECKOUT: '排队结账', PAID: '确认付款', EXIT: '通过闸机', RETURN: '返回停靠位',
    ASSIST: '等待人工', DONE: '购物完成', HANDOFF: '正在派店员', STAFF_PENDING: '人工订单待处理'
  };

  const pointKey = ({ x, y }) => y * WIDTH + x;
  const NARROW_AISLES = [8, 14].map((first, index) => ({
    id: index + 1,
    left: first - 1.16,
    right: first + 2.74,
    shoulders: [first - 2, first + 3],
    cells: [first, first + 1].flatMap(x => Array.from({ length:10 }, (_, i) => pointKey({ x, y:i + 3 })))
  }));
  function narrowAisleAt({ x, y } = {}) {
    return y >= AISLE_TOP && y <= AISLE_BOTTOM
      ? NARROW_AISLES.find(aisle => x >= aisle.left && x <= aisle.right) : undefined;
  }
  const samePoint = (a, b) => a.x === b.x && a.y === b.y;
  const gridPoint = ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  function crossesCounter(from, to, clearance = COUNTER_CLEARANCE) {
    let enter = 0;
    let leave = 1;
    for (const axis of ['x', 'y']) {
      const [min, max] = COUNTER_BOUNDS[axis];
      const start = from[axis];
      const delta = to[axis] - start;
      if (delta === 0) {
        if (start < min - clearance || start > max + clearance) return false;
        continue;
      }
      const low = (min - clearance - start) / delta;
      const high = (max + clearance - start) / delta;
      enter = Math.max(enter, Math.min(low, high));
      leave = Math.min(leave, Math.max(low, high));
      if (enter > leave) return false;
    }
    return true;
  }

  const walkable = ({ x, y }) => x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1 &&
    !(x === 20 && y === 12) &&
    !SHELVES.some(([xMin, xMax, yMin, yMax]) => x >= xMin - 1 && x <= xMax + 1 && y >= yMin - 1 && y <= yMax + 1);
  const offsets = [[1, 0], [0, 1], [0, -1], [-1, 0]];
  const neighbors = point => offsets.map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))
    .filter(next => walkable(next) && !crossesCounter(point, next));
  const checkoutLane = point => point.x === CASHIER.x && point.y >= QUEUE_APPROACH.y && point.y <= EXIT.y;
  const queueLaneBlocks = new Set(Array.from({ length:EXIT.y - QUEUE_APPROACH.y + 1 }, (_, index) =>
    pointKey({ x:CASHIER.x, y:QUEUE_APPROACH.y + index })));
  const navigationRoutes = new Map();
  function navigationRoute(from, to, blocked) {
    if (blocked?.size) return astar(from, to, new Set([...queueLaneBlocks, ...blocked]));
    const key = `${pointKey(from)}:${pointKey(to)}`;
    if (!navigationRoutes.has(key)) navigationRoutes.set(key, astar(from, to, queueLaneBlocks));
    return navigationRoutes.get(key);
  }

  function astar(start, goal, blocked = new Set(), canLeaveBlockedArea = () => false) {
    if (samePoint(start, goal)) return [start];
    const open = [{ point: start, cost: 0, h: manhattan(start, goal), previous: null }];
    const best = new Map([[pointKey(start), 0]]);
    while (open.length) {
      open.sort((a, b) => (a.cost + a.h) - (b.cost + b.h) || a.h - b.h);
      const current = open.shift();
      if (current.cost !== best.get(pointKey(current.point))) continue;
      if (samePoint(current.point, goal)) {
        const path = [];
        for (let node = current; node; node = node.previous) path.push(node.point);
        return path.reverse();
      }
      for (const point of neighbors(current.point)) {
        const key = pointKey(point);
        const cost = current.cost + 1;
        if ((blocked.has(key) && !canLeaveBlockedArea(current.point, point)) || cost >= (best.get(key) ?? Infinity)) continue;
        best.set(key, cost);
        open.push({ point, cost, h: manhattan(point, goal), previous: current });
      }
    }
    return [];
  }

  const routes = new Map();
  function routeBetween(a, b) {
    const key = `${pointKey(a)}:${pointKey(b)}`;
    if (!routes.has(key)) routes.set(key, astar(a, b));
    return routes.get(key);
  }
  function travel(a, b) {
    const from = gridPoint(a);
    const join = samePoint(b, CASHIER) && !checkoutLane(from);
    const points = join ? navigationRoute(from, QUEUE_APPROACH) : routeBetween(from, b);
    if (join && points.length) {
      return ((points.length - 1) / SPEED + manhattan(QUEUE_APPROACH, CASHIER) / QUEUE_SPEED) * CELL_METERS * SECOND;
    }
    return points.length ? (points.length - 1) * CELL_METERS / SPEED * SECOND : Infinity;
  }
  function timeLabel(ms) {
    const n = START_MIN * 60 + Math.floor(ms / SECOND);
    const fmt = value => String(value).padStart(2, '0');
    return `${fmt(Math.floor(n / 3600))}:${fmt(Math.floor(n / 60) % 60)}:${fmt(n % 60)}`;
  }
  function parseTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return NaN;
    return (Number(match[1]) * 60 + Number(match[2]) - START_MIN) * MINUTE + Number(match[3] || 0) * SECOND;
  }
  const totalFor = (items, get) => SKUS.reduce((sum, sku) => sum + (items[sku] || 0) * get(sku), 0);
  function scoreTree(features) {
    let node = CART;
    const splits = [];
    const labels = { current_stock: '库存', sales_15m: '近15分钟销量', restock_eta_minutes: '补货预计分钟' };
    while (Array.isArray(node)) {
      const [feature, threshold, left, right] = node;
      const lower = features[feature] <= threshold;
      splits.push(`${labels[feature] || feature} ${lower ? '≤' : '>'} ${threshold}`);
      node = lower ? left : right;
    }
    return { risk: node, rule: splits.join(' → ') };
  }

  // Count the report's milk-to-bread rule once from the 100 synthetic baskets.
  const shoppingBaskets = [
    ...Array.from({ length: 24 }, () => ['MILK', 'BREAD']),
    ...Array.from({ length: 16 }, () => ['MILK']),
    ...Array.from({ length: 6 }, () => ['BREAD']),
    ...Array.from({ length: 54 }, () => ['EGG'])
  ];
  function breadRule() {
    const count = (...items) => shoppingBaskets.filter(basket => items.every(sku => basket.includes(sku))).length;
    const n = shoppingBaskets.length;
    const together = count('MILK', 'BREAD');
    const support = together / n;
    const confidence = together / count('MILK');
    return { n, together, support, confidence, lift: confidence / (count('BREAD') / n) };
  }
  const milkToBread = breadRule();

  const SHOPPER_PICK = {
    BREAD: { x: 14, y: 3 }, EGG: { x: 8, y: 3 }, MILK: { x: 14, y: 12 }, FRUIT: { x: 8, y: 12 }
  };

  function create(options = {}) {
    const scenario = Object.hasOwn(presets, options.scenario) ? options.scenario : 'normal';
    const mode = options.mode === 'fallback' ? 'fallback' : 'cart';
    const entryStart = options.entryStart === true;
    const entryRoute = entryStart ? OUTSIDE_ENTRY_ROUTE : DOCK_ENTRY_ROUTE;
    const seed = scenario === 'handoff' ? 13 : Number.isSafeInteger(options.seed) ? options.seed : 6143;
    let randomState = seed >>> 0;
    const preset = presets[scenario];
    const promoEnabled = scenario === 'promo' || scenario === 'showcase';
    const promoIsActive = now => promoEnabled && now >= PROMO_START && now < PROMO_END;
    const getPrice = (sku, now) => sku === 'FRUIT' && promoIsActive(now) ? 24 : products[sku].price;
    const knownStock = { MILK: scenario === 'compare' ? 2 : 8, EGG: 3, FRUIT: 12, BREAD: 10 };
    const worldStock = { ...knownStock };
    let stockoutSku = null;
    if (scenario === 'restock' || scenario === 'late') {
      stockoutSku = SKUS.includes(options.stockoutSku) ? options.stockoutSku : 'MILK';
    } else if (scenario === 'showcase') {
      stockoutSku = 'MILK';
    }
    if (stockoutSku) worldStock[stockoutSku] = 0;
    const simulatedEta = scenario === 'compare' ? { MILK: 9 } : {};
    const sales = { MILK: 4, EGG: 5, FRUIT: 2, BREAD: 1 };
    const restockDelay = (scenario === 'showcase' ? 90 : scenario === 'restock' ? 120 : 360) * SECOND;

    let timeMs = preset.start;
    let peopleTimeMs = preset.start;
    let peopleRemainder = 0;
    let remainder = 0;
    let phaseCode = 'IDLE';
    let status = entryStart ? '机器人在入口外等候，接单后从入口进店。'
      : '机器人停在店内入口旁的停靠位，接单后前往入口点。';
    let position = { x: entryRoute[0].x, y: entryRoute[0].y };
    let target = null;
    let route = [];
    let routeIndex = 0;
    let arrived = null;
    let nextActionAt = null;
    let pending = null;
    let decision = null;
    let items = {};
    let originalItems = {};
    let removed = {};
    let basket = {};
    let caps = {};
    let budget = 0;
    let deadline = 0;
    let fruitPickedAt = null;
    let paid = false;
    let paidAmount = null;
    let outcome = null;
    let orderExit = null;
    let handoff = null;
    let gateAt = null;
    let gateReadyAt = null;
    let register = null;
    const queue = [];
    let shopperSequence = 0;
    let promoEvaluated = false;
    let promoWaiting = false;
    let promoDeadline = null;
    let blockedSince = null;
    let lastDetourAt = null;
    let blockedAttempts = 0;
    let safeSamples = 0;
    let pullingOut = false;
    let crossingStaged = false;
    let spawnAt = preset.start + 13 * SECOND;
    let walkingDistance = 0;
    const logs = [];
    const decisionHistory = [];
    const trail = [{ ...position }];
    const pedestrians = options.quiet === true ? [] : initialShoppers();
    const tickets = {};

    function log(kind, title, text) {
      logs.push({ timeMs, time: timeLabel(timeMs), kind, title, text });
    }
    function setPhase(next, detail) {
      phaseCode = next;
      if (detail) status = detail;
    }
    function setDecision(title, text, candidates = [], selectedSku = null) {
      decision = { title, text, candidates };
      const candidateSnapshots = candidates.map(({ features, ...candidate }) =>
        Object.freeze(features ? { ...candidate, features:Object.freeze({ ...features }) } : candidate));
      decisionHistory.push(Object.freeze({
        timeMs, title, text, candidates:Object.freeze(candidateSnapshots), selectedSku
      }));
    }
    function rand() {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    }

    function initialShoppers() {
      const items = SKUS.filter(sku => worldStock[sku] > 0);
      const count = Math.min(items.length, scenario === 'crowd' ? 2 : 2 + Math.floor(rand() * 2));
      return Array.from({ length: count }, (_, index) => {
        const [item] = items.splice(Math.floor(rand() * items.length), 1);
        const point = SHOPPER_PICK[item];
        if (index === 0) {
          const person = makeShopper(item, QUEUE_SEATS[0], 'queue');
          queue.push({ owner:'customer', person });
          return person;
        }
        if (index === 1) {
          const person = makeShopper(item, point, 'pick');
          person.stopAt = peopleTimeMs + (3 + rand() * 4) * SECOND;
          return person;
        }
        const start = {x:14, y:14 + Math.floor(rand() * 2)};
        const person = makeShopper(item, start, 'browse');
        directShopper(person, point);
        return person;
      });
    }

    function makeShopper(item, point, stage) {
      return { ...point, id:++shopperSequence, kind:'shopper', stage, item, variant:Math.floor(rand() * 4),
        route:[], next:0, stopAt:peopleTimeMs, speed:0.5 };
    }

    function directShopper(person, destination, blocked, from = gridPoint(person)) {
      if (crossesCounter(person, from)) return false;
      const path = person.stage === 'exit' ? routeBetween(from, destination) : navigationRoute(from, destination, blocked);
      if (!path.length) return false;
      person.destination = destination;
      person.route = path;
      person.next = samePoint(person, from) ? 1 : 0;
      return true;
    }

    function checkoutQueueView() {
      const robotIndex = queue.findIndex(entry => entry.owner === 'robot');
      const waiting = queue.filter(entry => entry.owner === 'customer').length;
      const customersAhead = register?.owner === 'robot' ? 0 :
        (robotIndex < 0 ? waiting : robotIndex) + Number(register?.owner === 'customer');
      const atCounter = register && samePoint(register.person || position, CASHIER);
      const serving = atCounter && (register.person?.stage === 'pay' || register.owner === 'robot' && !paid) ? register.owner : null;
      return { waiting, customersAhead, serving, robotQueued:robotIndex >= 0, staffAway:Boolean(activeStockTicket()) };
    }

    function estimatedQueueDelay(arrival) {
      if (register?.owner === 'robot') return 0;
      const work = activeStockTicket();
      const staffDelay = work ? Math.max(0, work[1].at - timeMs) : 0;
      const turnTime = SHOPPER_CHECKOUT_MS + 6 * SECOND;
      const robotIndex = queue.findIndex(entry => entry.owner === 'robot');
      const ahead = robotIndex >= 0 ? robotIndex : queue.length;
      const estimate = staffDelay + ahead * turnTime
        + (register?.owner === 'customer' ? Math.max(3 * SECOND, (register.until ?? peopleTimeMs + turnTime) - peopleTimeMs + 3 * SECOND) : 0);
      return Math.max(0, estimate - Math.max(0, arrival - timeMs));
    }

    function checkoutFinishEstimate(arrival) {
      return arrival + estimatedQueueDelay(arrival) + ROBOT_CHECKOUT_MS;
    }
    const returning = () => phaseCode === 'RETURN';
    const active = () => returning() || (phaseCode !== 'IDLE' && outcome === null);
    const robotVisible = () => !orderExit || Boolean(handoff);
    const basketTotal = () => totalFor(basket, sku => getPrice(sku, timeMs));
    const basketMass = () => totalFor(basket, sku => products[sku].weight);
    const left = sku => Math.max(0, (items[sku] || 0) - (removed[sku] || 0) - (basket[sku] || 0));
    const needed = () => SKUS.filter(sku => left(sku) > 0);
    const tillCheckout = () => Math.min(deadline - travel(CASHIER, EXIT) - 3 * SECOND,
      fruitPickedAt === null ? Infinity : fruitPickedAt + FRESH_MS);
    const directCheckout = () => checkoutFinishEstimate(timeMs + travel(position, CASHIER)) - timeMs;
    const latestReply = () => tillCheckout() - directCheckout() - SAFE_MARGIN;

    function waitReplyDeadline(from, at) {
      const directTime = checkoutFinishEstimate(at + travel(from, CASHIER)) - at;
      return Math.floor(tillCheckout() - Math.max(directTime, WAIT_HANDOFF_ESTIMATE) - SAFE_MARGIN);
    }

    function validate(order) {
      const lines = order.items || {};
      if (!SKUS.some(sku => Number(lines[sku]) > 0)) return '请先选择至少一件商品。';
      if (Object.keys(lines).some(sku => !Object.hasOwn(products, sku) || !Number.isInteger(Number(lines[sku])) || Number(lines[sku]) < 0)) {
        return '商品须在目录中，数量须为非负整数。';
      }
      if (!Number.isFinite(Number(order.budget)) || Number(order.budget) <= 0) return '请输入有效预算。';
      if (totalFor(lines, sku => getPrice(sku, timeMs)) > Number(order.budget)) return '当前报价超过预算，请修改清单或预算。';
      const mass = totalFor(lines, sku => products[sku].weight);
      if (mass > LOAD_MAX) return `超出载重 ${mass - LOAD_MAX} 克。机器人最大载重为 ${LOAD_MAX} 克。`;
      const limit = parseTime(order.leaveBy);
      if (!Number.isFinite(limit) || limit <= timeMs) return '最晚离店时间必须晚于当前模拟时刻。';
      return null;
    }

    function requestChoice(kind, text, extra = {}, upper = Infinity) {
      route = [];
      target = null;
      const expiresAt = Math.min(timeMs + MINUTE, upper);
      if (expiresAt <= timeMs) return assist('剩余时间不足以等待顾客确认。');
      const quantities = kind === 'delete'
        ? Object.freeze(Object.fromEntries(extra.skus.map(sku => [sku, left(sku)]))) : undefined;
      pending = { kind, text, expiresAt, ...extra, quantities };
      setPhase(kind === 'recommend' ? 'MINE' : 'WAIT_CONFIRM', text);
      log('choice', '请求顾客确认', text);
    }

    function submit(order = {}) {
      if (phaseCode !== 'IDLE') return { ok: false, error: '当前场景已有订单，请重置后再下单。' };
      const error = validate(order);
      if (error) return { ok: false, error };
      items = Object.fromEntries(SKUS.filter(sku => Number(order.items[sku]) > 0).map(sku => [sku, Number(order.items[sku])]));
      originalItems = { ...items };
      caps = Object.fromEntries(SKUS.map(sku => [sku, getPrice(sku, timeMs)]));
      budget = Number(order.budget);
      deadline = parseTime(order.leaveBy);
      log('order', '接单并检查约束', `商品 ${totalFor(items, () => 1)} 件，预计 ${totalFor(items, sku => caps[sku])} 元 / ${totalFor(items, sku => products[sku].weight)} 克；最晚 ${timeLabel(deadline)} 离店。`);
      target = { ...ENTRY };
      route = entryRoute.map(({ x, y }) => ({ x, y }));
      routeIndex = 1;
      arrived = { action:'entry', skipRecommendation:order.skipRecommendation };
      setPhase('ENTER', entryStart ? '机器人从店外穿过入口进店。' : '机器人驶离店内停靠位，前往入口点。');
      log('navigation', entryStart ? '从入口外出发' : '从停靠位出发', status);
      return { ok: true };
    }

    function beginShopping(skipRecommendation) {
      log('navigation', '到达入口点', entryStart ? '机器人已从入口进店，准备规划购物路线。'
        : '机器人已从店内停靠位到达入口点，准备规划购物路线。');
      const recommendation = milkToBread;
      if (!skipRecommendation && items.MILK && !items.BREAD && knownStock.BREAD > 0 &&
          totalFor(items, sku => caps[sku]) + caps.BREAD <= budget &&
          totalFor(items, sku => products[sku].weight) + products.BREAD.weight <= LOAD_MAX &&
          recommendation.support >= 0.1 && recommendation.confidence >= 0.6 && recommendation.lift >= 1.2) {
        const text = `Apriori 推荐加购一袋面包（12 元 / 400 克）。${recommendation.n} 个模拟购物篮中牛奶和面包共现 ${recommendation.together} 次，置信度 ${Math.round(recommendation.confidence * 100)}%，提升度 ${recommendation.lift}。`;
        setDecision('关联推荐', text);
        requestChoice('recommend', text, { sku: 'BREAD', ...recommendation });
      } else {
        setPhase('PLAN', '计算库存风险和下一取货点。');
      }
    }

    function assist(text) {
      if (outcome) return;
      releaseRobotRegister();
      route = [];
      target = null;
      decision = null;
      if (handoff) {
        pending = null;
        outcome = 'HANDOFF';
        setPhase('STAFF_PENDING', text);
        log('warning', '人工订单待处理', text);
        return;
      }
      pending = { kind: 'assist', text, expiresAt: null };
      setPhase('ASSIST', text);
      log('warning', '停车等待人工', text);
    }

    function answer(approved) {
      if (!pending) return false;
      const reply = pending;
      if (reply.kind === 'assist') {
        if (!approved) return false;
        pending = null;
        handoff = { parked: { ...position }, stage:'dispatch', requestedAt:timeMs };
        setPhase('HANDOFF', '已通知店员。机器人原地停车，保留原清单、实取篮和付款状态。');
        log('warning', '已派店员接手', status);
        return true;
      }
      if (timeMs >= reply.expiresAt) return false;
      pending = null;
      if (reply.kind === 'recommend') {
        if (approved) items.BREAD = 1;
        log('choice', approved ? '已同意加购' : '保留原始清单', approved ? '面包加入授权清单，仍须到架核验后才能入篮。' : '不添加面包。');
        setPhase('PLAN', '按确认后的清单规划下一站。');
        return true;
      }
      if (!approved) {
        assist('顾客拒绝方案，保留购物篮和原订单，交员工处理。');
        return true;
      }
      if (reply.kind === 'delete') {
        if (reply.skus.some(sku => reply.quantities[sku] !== left(sku))) {
          assist('待取数量已经变化，保留原清单和购物篮，交员工核对。');
          return true;
        }
        for (const sku of reply.skus) removed[sku] = (removed[sku] || 0) + reply.quantities[sku];
        log('choice', '关闭获准删减的剩余量', `本次不再取 ${reply.skus.map(names).join('、')}；原清单缺口仍保留，付款并实际离店后再记结果。`);
      } else if (reply.kind === 'reprice') {
        if (reply.skus.some(sku => getPrice(sku, timeMs) > reply.prices[sku])) {
          assist('顾客确认后报价又上涨，需要人工重新核对。');
          return true;
        }
        for (const sku of reply.skus) caps[sku] = reply.prices[sku];
        log('choice', '顾客确认新报价', '按已确认的价格上限继续处理。');
      }
      if (register?.owner === 'robot') setPhase('CHECKOUT', '确认已收到，在收银台重新核价。');
      else setPhase('PLAN', '确认已收到，重新规划。');
      return true;
    }

    function riskFor(sku) {
      const stock = knownStock[sku];
      if (!Number.isFinite(stock)) return { risk:null, source:'UNKNOWN', priority:1, riskPath:'可用库存未知，到架核验' };
      if (stock <= 0) return { risk: null, source: 'OBSERVED', priority: 1, riskPath: '现场已知无货，走补货分支' };
      const fallback = () => ({ risk: null, source: 'FALLBACK', priority: stock <= 3 ? 0 : 1,
        riskPath: stock <= 3 ? '可用库存不超过 3 件，优先取' : '可用库存超过 3 件，按新增耗时排序' });
      if (mode === 'fallback') return fallback();
      const ticket = tickets[sku];
      const eta = ticket && !ticket.completed ? Math.max(0, (ticket.at - timeMs) / MINUTE) : simulatedEta[sku];
      const features = {
        current_stock: stock, sales_15m: sales[sku], promo: Number(sku === 'FRUIT' && getPrice(sku, timeMs) === 24),
        hour: (START_MIN + timeMs / MINUTE) / 60, restock_eta_minutes: eta ?? 0, eta_missing: eta === undefined ? 1 : 0
      };
      if (!MODEL_INFO.features.every(feature => Number.isFinite(features[feature]))) return fallback();
      const { risk, rule } = scoreTree(features);
      return { risk, source: 'MODEL', priority: risk >= MODEL_INFO.threshold ? 0 : 1, features, rule,
        featureTimeMs:timeMs, horizonEndMs:timeMs + MODEL_INFO.horizonMinutes * MINUTE,
        riskPath: `库存 ${stock} 件，近 15 分钟销量 ${sales[sku]} 件，补货 ETA ${eta === undefined ? '未知（按训练口径填 0）' : `${eta.toFixed(1)} 分钟`}。` };
    }

    function estimateOrderPayment(from, start, remaining, first, restockMode) {
      function estimate(positionAt, next, time, fruitAt, preferred) {
        if (!next.length) {
          const paidAt = checkoutFinishEstimate(time + travel(positionAt, CASHIER));
          return fruitAt === null || paidAt <= fruitAt + FRESH_MS ? paidAt : Infinity;
        }
        let earliest = Infinity;
        for (const sku of preferred ? [preferred] : next) {
          const point = products[sku];
          const ticket = tickets[sku];
          const stockPending = ticket && !ticket.completed;
          if (stockPending && restockMode === 'available') continue;
          let reachedAt = time + travel(positionAt, point);
          if (stockPending && restockMode === 'expected') reachedAt = Math.max(reachedAt, ticket.at);
          const pickedAt = reachedAt + left(sku) * PICK_MS;
          const pickFruit = sku === 'FRUIT' && fruitAt === null ? reachedAt + PICK_MS : fruitAt;
          earliest = Math.min(earliest, estimate(point, next.filter(item => item !== sku), pickedAt, pickFruit));
        }
        return earliest;
      }
      return estimate(from, remaining, start, fruitPickedAt, first);
    }

    function canFinish(start, first, remaining, allowFutureRestock) {
      const paidAt = estimateOrderPayment(position, start, remaining, first, allowFutureRestock ? 'expected' : 'available');
      return paidAt + travel(CASHIER, EXIT) + 3 * SECOND < deadline;
    }

    function waitCutoff(from, start, remaining, first, restockMode) {
      const paidAt = estimateOrderPayment(from, start, remaining, first, restockMode);
      const continuation = tillCheckout() - (paidAt - start) - SAFE_MARGIN;
      const confirmAndResolve = waitReplyDeadline(from, start) - MINUTE;
      return Math.floor(Math.min(continuation, confirmAndResolve));
    }

    function tightenRestockCutoff(waiting, start) {
      // Assume the awaited stock is available when leaving the waiting point.
      // Include checkout, but do not subtract this same wait a second time.
      const cutoff = waitCutoff(WAIT_POINT, start, needed(), null, 'ready-after-wait');
      for (const sku of waiting) tickets[sku].waitCutoff = Math.min(tickets[sku].waitCutoff, cutoff);
      return Math.min(...waiting.map(sku => tickets[sku].waitCutoff));
    }

    function considerPromo(candidate, remaining) {
      if (scenario !== 'promo' || promoEvaluated || candidate.sku !== 'FRUIT' || timeMs >= PROMO_START || candidate.priority === 0) return false;
      const directAt = estimateOrderPayment(position, timeMs, remaining, 'FRUIT', 'expected');
      if (directAt >= PROMO_START) return false;
      const departureAt = Math.max(PROMO_START, timeMs + travel(position, WAIT_POINT));
      promoDeadline = waitCutoff(WAIT_POINT, departureAt, remaining, 'FRUIT', 'expected');
      const afterWait = estimateOrderPayment(WAIT_POINT, departureAt, remaining, 'FRUIT', 'expected');
      const saving = 6 * left('FRUIT');
      const extraMinutes = Math.max(0, (afterWait - directAt) / MINUTE);
      if (departureAt >= promoDeadline || afterWait >= PROMO_END || saving - 0.5 * extraMinutes <= 0) {
        promoEvaluated = true;
        log('promo', '跳过促销等待', '继续等待会占用离店余量或抵消优惠，按实际结账时的有效价格处理。');
        return false;
      }
      promoWaiting = true;
      log('promo', '比较同一购物篮', `每盒可省 6 元，预计多用 ${extraMinutes.toFixed(1)} 分钟，按 0.5 元/分钟折算后仍有净收益，先去安全区。`);
      setDecision('选择等待促销', `按当时库存和时间估算，水果每盒由 30 元降至 24 元；实际结账时仍重新核价。`, [candidate]);
      beginMove(WAIT_POINT, 'wait');
      return true;
    }

    function candidateOrder(remaining) {
      return remaining.map(sku => {
        const product = products[sku];
        const activeTicket = tickets[sku] && !tickets[sku].completed;
        const delta = (travel(position, product) + left(sku) * PICK_MS + travel(product, CASHIER) - travel(position, CASHIER)) / SECOND;
        const eligible = !activeTicket && canFinish(timeMs, sku, remaining, true);
        return { ...product, stock: knownStock[sku], remaining: left(sku), delta, eligible, ...riskFor(sku) };
      }).sort((a, b) => a.priority - b.priority || a.delta - b.delta || a.sku.localeCompare(b.sku));
    }

    function requestDeletion(skus, reason, waitSafety = false) {
      const skusLeft = skus.filter(sku => left(sku) > 0);
      if (!skusLeft.length) return setPhase('PLAN', '余项已处理，重新规划。');
      const remainingAfter = needed().filter(sku => !skusLeft.includes(sku));
      if (!remainingAfter.length && !basketMass()) return assist('没有可结算的商品，请员工处理订单。');
      const label = skusLeft.map(sku => `${names(sku)} ${left(sku)} ${products[sku].unit}`).join('、');
      const replyDeadline = waitSafety ? waitReplyDeadline(position, timeMs) : latestReply();
      requestChoice('delete', `${reason} 是否删减 ${label}，保留已经取到的商品？`, { skus: skusLeft, waitSafety }, replyDeadline);
    }

    function plan() {
      if (handoff) return planStaffOrder();
      if (paid) return beginMove(EXIT, 'exit');
      const remaining = needed();
      if (!remaining.length) {
        if (!basketMass()) return assist('购物篮为空，需要员工处理。');
        return beginMove(QUEUE_APPROACH, 'checkout');
      }
      const candidates = candidateOrder(remaining);
      const choice = candidates.find(candidate => candidate.eligible);
      if (choice) {
        if (considerPromo(choice, remaining)) return;
        const metric = choice.risk === null ? choice.riskPath : `CART 得分 ${choice.risk.toFixed(3)}，${choice.priority === 0 ? '达到优先阈值 ' + MODEL_INFO.threshold.toFixed(2) : '同档按新增时间排序'}`;
        const text = `${metric}，插入该站约增加 ${Math.round(choice.delta)} 秒。随后由 A* 计算通路。`;
        setDecision(`下一站 · ${choice.name}`, text, candidates, choice.sku);
        log('decision', `选取${choice.name}货架`, text);
        beginMove({ x: choice.x, y: choice.y, label: `${choice.name}货架` }, 'pick', choice.sku);
        return;
      }
      const waiting = remaining.filter(sku => tickets[sku] && !tickets[sku].completed);
      if (waiting.length === remaining.length) {
        const remainingIdle = Math.min(...waiting.map(sku => WAIT_MS - tickets[sku].idleMs));
        const arrivalAt = timeMs + travel(position, WAIT_POINT);
        const cutoff = tightenRestockCutoff(waiting, arrivalAt);
        if (remainingIdle > 0 && arrivalAt < cutoff) {
          setDecision('补货尚未完成', '预计补货时间不会直接改变购物篮。收到完成消息、通道安全后才能返回货架复核。', candidates);
          beginMove(WAIT_POINT, 'wait');
          return;
        }
        return requestDeletion(waiting, '补货等待到期。', true);
      }
      if (waiting.length) {
        const ready = remaining.filter(sku => !waiting.includes(sku));
        if (ready.some(sku => canFinish(timeMs, sku, ready, false))) {
          return requestDeletion(waiting, '等补货将无法及时离店。');
        }
      }
      requestDeletion(remaining, '继续采购已不满足离店或生鲜时限。');
    }

    function staffRoute(from, to, people = [], usesExit = false, occupiedAisle) {
      const obstacles = [handoff.parked, ...people];
      const blocked = new Set(occupiedAisle?.cells);
      for (const person of obstacles) {
        const cell = gridPoint(person);
        for (let x = cell.x - 1; x <= cell.x + 1; x++) {
          for (let y = cell.y - 1; y <= cell.y + 1; y++) {
            if (distance({ x, y }, person) < STAFF_CLEARANCE) blocked.add(pointKey({ x, y }));
          }
        }
      }
      return usesExit ? astar(from, to, blocked) : navigationRoute(from, to, blocked);
    }

    function dispatchStaff() {
      if (register || activeStockTicket()) {
        if (timeMs - handoff.requestedAt >= 45 * SECOND) {
          return assist('店员暂未能离开收银或补货岗位，订单仍待处理。');
        }
        status = '店员先完成手头的收银或补货，随后来取购物篮。';
        return;
      }
      const start = gridPoint(STAFF_COUNTER);
      const parked = gridPoint(handoff.parked);
      const pickupPoints = [];
      for (let x = parked.x - 2; x <= parked.x + 2; x++) {
        for (let y = parked.y - 2; y <= parked.y + 2; y++) {
          const point = { x, y, label:'机器人旁' };
          const gap = distance(point, handoff.parked);
          if (!walkable(point) || gap < STAFF_CLEARANCE || gap > 2.35 || crossesCounter(point, handoff.parked, 0)) continue;
          const path = staffRoute(start, point);
          if (path.length) pickupPoints.push({ point, steps:path.length, occupied:pedestrians.some(person => distance(point, person) < STAFF_CLEARANCE) });
        }
      }
      pickupPoints.sort((a, b) => Number(a.occupied) - Number(b.occupied) || a.steps - b.steps);
      if (!pickupPoints.length) return assist('店员暂时无法安全到达机器人旁，订单仍待处理。');
      position = { ...STAFF_COUNTER };
      trail.length = 0;
      trail.push({ ...position });
      handoff.stage = 'approach';
      log('warning', '店员从收银台出发', '店员沿店内通道前往机器人旁，机器人保持停车。');
      beginMove(pickupPoints[0].point, 'handoff');
    }

    function planStaffOrder() {
      if (paid) {
        const exit = distance(EXIT, handoff.parked) < STAFF_CLEARANCE ||
          (handoff.parked.y > EXIT.y && Math.abs(EXIT.x - handoff.parked.x) < STAFF_CLEARANCE)
          ? { ...EXIT, x:EXIT.x - 1 } : EXIT;
        return beginMove(exit, 'exit');
      }
      const remaining = needed();
      if (!remaining.length) {
        if (!basketMass()) return assist('购物篮为空，没有发起付款，订单仍待处理。');
        return beginMove(QUEUE_APPROACH, 'checkout');
      }
      const available = remaining.filter(sku => worldStock[sku] > 0)
        .sort((a, b) => travel(position, products[a]) - travel(position, products[b]));
      const sku = available[0];
      if (!sku) return requestDeletion(remaining, '店员核对后，剩余商品暂时无货。');
      const { x, y } = products[sku];
      const shelf = { x, y };
      const pickup = distance(shelf, handoff.parked) >= STAFF_CLEARANCE ? shelf
        : neighbors(shelf).filter(point => distance(point, handoff.parked) >= STAFF_CLEARANCE)
          .find(point => staffRoute(gridPoint(position), point).length);
      if (!pickup) return assist(`店员暂时无法接近${names(sku)}货架，订单仍待处理。`);
      log('decision', `店员去取${names(sku)}`, '继续处理顾客已授权的剩余商品，到架核验后才入篮。');
      beginMove({ ...pickup, label:`${names(sku)}货架` }, 'pick', sku);
    }

    function beginMove(point, action, sku) {
      const from = gridPoint(position);
      const usesExit = action === 'exit';
      const nextRoute = handoff ? staffRoute(from, point, [], usesExit)
        : usesExit ? routeBetween(from, point) : navigationRoute(from, point);
      if (!nextRoute.length || crossesCounter(position, from)) return assist('当前路线不可达，请人工处理。');
      target = sku ? { ...point, sku } : { ...point };
      route = nextRoute.map(node => ({ ...node }));
      routeIndex = samePoint(position, from) ? 1 : 0;
      arrived = { action, sku };
      blockedSince = null;
      lastDetourAt = null;
      blockedAttempts = 0;
      safeSamples = 0;
      pullingOut = false;
      setPhase('MOVE', `${handoff ? '店员' : ''}前往${point.label} · A* 已生成 ${nextRoute.length - 1} 步通路。`);
      if (!handoff && scenario === 'crowd' && !crossingStaged) stageCrossing();
    }

    function stageCrossing() {
      if (pedestrians.length >= 3 || scenario !== 'crowd') return;
      const cross = route[Math.min(4, route.length - 2)];
      if (!cross || samePoint(cross, ENTRY)) return;
      const start = neighbors(cross).find(point => !route.some(cell => samePoint(cell, point)) &&
        !aisleHasHuman(narrowAisleAt(point)));
      if (!start) return;
      const person = makeShopper(SKUS[Math.floor(rand() * SKUS.length)], start, 'browse');
      person.stopAt = peopleTimeMs + 2 * SECOND;
      person.crossing = true;
      directShopper(person, cross);
      pedestrians.push(person);
      crossingStaged = true;
    }

    function releaseRobotRegister() {
      const queued = queue.findIndex(entry => entry.owner === 'robot');
      if (queued >= 0) queue.splice(queued, 1);
      if (register?.owner === 'robot') register = null;
    }

    function dispatchRegister() {
      if (register || !queue.length || (paid && !outcome) || dueStockTicket()) return;
      if (handoff && !orderExit && phaseCode !== 'CHECKOUT') return;
      const entry = queue[0];
      if (!samePoint(entry.person || position, QUEUE_SEATS[0])) return;
      register = queue.shift();
      if (register.person) register.person.stage = 'pay';
    }

    function walkQueueEntry(entry, destination) {
      const actor = entry.person || position;
      if (samePoint(actor, destination)) return;
      const next = actor.x !== CASHIER.x ? { x:CASHIER.x, y:actor.y } : destination;
      const gap = distance(actor, next);
      const speed = entry.person ? entry.person.speed : handoff ? 0.8 : QUEUE_SPEED;
      const step = Math.min(gap, speed * TICK / SECOND / CELL_METERS);
      const proposal = { x:actor.x + (next.x - actor.x) * step / gap, y:actor.y + (next.y - actor.y) * step / gap };
      if (crossesCounter(actor, proposal)) return;
      const others = [...queue, ...(register ? [register] : [])]
        .filter(other => other !== entry).map(other => other.person || position);
      others.push(...pedestrians.filter(person => person.stage === 'exit'));
      if (others.some(other => distance(proposal, other) < 2.4 && distance(proposal, other) < distance(actor, other))) return;
      if (pedestrians.some(person => person !== actor && !others.includes(person) &&
          distance(proposal, person) < 1 && distance(proposal, person) < distance(actor, person))) return;
      const arrived = gap <= step + 0.00001;
      if (entry.person) Object.assign(actor, arrived ? next : proposal);
      else {
        position = arrived ? { x:next.x, y:next.y } : proposal;
        target = { ...destination, label:samePoint(destination, CASHIER) ? CASHIER.label : '共用收银队列' };
        route = [{ ...position }, ...(arrived && samePoint(position, destination) ? [] : [next, ...samePoint(next, destination) ? [] : [destination]])];
        walkingDistance += step * CELL_METERS;
        if (arrived) trail.push({ ...position });
      }
    }

    function walkCheckoutLine() {
      if (register?.person?.stage === 'exit' && register.person.y >= 17) register = null;
      dispatchRegister();
      if (register?.person?.stage === 'pay') {
        const person = register.person;
        walkQueueEntry(register, CASHIER);
        if (samePoint(person, CASHIER)) {
          if (register.until === undefined) register.until = peopleTimeMs + SHOPPER_CHECKOUT_MS;
          else if (peopleTimeMs >= register.until) {
            person.stage = 'exit';
            directShopper(person, EXIT);
          }
        }
      } else if (register?.owner === 'robot' && phaseCode === 'CHECKOUT') {
        walkQueueEntry(register, CASHIER);
      }
      queue.forEach((entry, index) => walkQueueEntry(entry, QUEUE_SEATS[index] || QUEUE_APPROACH));
    }

    function updateShopperStage(person) {
      if (person.stage === 'browse') {
        if (person.crossing) {
          person.crossing = false;
          person.stopAt = peopleTimeMs + 2 * SECOND;
          directShopper(person, SHOPPER_PICK[person.item]);
        } else {
          if (!samePoint(person, SHOPPER_PICK[person.item])) return directShopper(person, SHOPPER_PICK[person.item]);
          person.stage = 'pick';
          person.stopAt = peopleTimeMs + (3 + rand() * 4) * SECOND;
        }
        return;
      }
      if (person.stage === 'pick') {
        person.stage = 'approachQueue';
        directShopper(person, QUEUE_APPROACH);
        return;
      }
      if (person.stage === 'approachQueue') {
        if (!samePoint(person, QUEUE_APPROACH)) return directShopper(person, QUEUE_APPROACH);
        if (queue.length >= QUEUE_SEATS.length + 1) return;
        queue.push({ owner:'customer', person });
        person.stage = 'queue';
        person.blockedSince = null;
        person.yielding = false;
        person.detourUntil = null;
        return;
      }
      if (person.stage === 'exit' && samePoint(person, EXIT)) {
        person.outside = true;
        person.route = [EXIT_THRESHOLD, OUTSIDE];
        person.next = 0;
      }
    }

    function replanShopper(person, obstacles) {
      const blocked = new Set();
      for (const { actor, clearance } of obstacles) {
        const center = gridPoint(actor);
        for (let x = center.x - 3; x <= center.x + 3; x++) {
          for (let y = center.y - 3; y <= center.y + 3; y++) {
            const point = { x, y };
            if (distance(point, actor) < clearance) blocked.add(pointKey(point));
          }
        }
      }
      const origins = [person.route[person.next - 1], person.route[person.next], gridPoint(person)].filter(point =>
        point && !blocked.has(pointKey(point)) && !crossesCounter(person, point) && distance(person, point) <= 1.00001 &&
        (Math.abs(point.x - person.x) < 0.00001 || Math.abs(point.y - person.y) < 0.00001));
      for (const from of origins) {
        if (!directShopper(person, person.destination, blocked, from)) continue;
        person.yielding = false;
        person.detourUntil = peopleTimeMs + 3 * SECOND;
        return;
      }
      if (person.yielding) return;
      const separation = point => Math.min(...obstacles.map(({ actor, clearance }) => distance(point, actor) - clearance));
      const pullouts = origins.flatMap(origin => neighbors(origin).filter(next =>
        !checkoutLane(next) && !blocked.has(pointKey(next)) && separation(next) > separation(person) + 0.1)
        .map(next => samePoint(origin, person) ? [next] : [origin, next]));
      pullouts.sort((a, b) => separation(b.at(-1)) - separation(a.at(-1)));
      if (!pullouts.length) return;
      person.route = pullouts[0];
      person.next = 0;
      person.yielding = true;
      person.detourUntil = peopleTimeMs + 3 * SECOND;
    }

    function aisleHasHuman(aisle, except, customersOnly = false) {
      if (!aisle) return false;
      if (pedestrians.some(person => person !== except && narrowAisleAt(person) === aisle)) return true;
      if (customersOnly) return false;
      const restocking = activeStockTicket();
      if (restocking) {
        const [sku, ticket] = restocking;
        return ticket.aisleClaim === aisle || narrowAisleAt(restockPosition(sku, ticket.elapsed)) === aisle;
      }
      return Boolean(handoff && !orderExit && handoff.stage !== 'dispatch' && narrowAisleAt(position) === aisle);
    }

    function enteringOccupiedAisle(from, to, movingStaff = false) {
      const aisle = narrowAisleAt(to);
      return aisle !== narrowAisleAt(from) && aisleHasHuman(aisle, from, movingStaff) ? aisle : undefined;
    }

    function waitOutsideAisle(person, aisle) {
      person.blockedSince ??= peopleTimeMs;
      if (peopleTimeMs < (person.aisleRetryAt ?? 0)) return;
      person.aisleRetryAt = peopleTimeMs + 1500;
      const from = [person.route[person.next - 1], gridPoint(person)].find(point => point &&
        !narrowAisleAt(point) && distance(person, point) <= 1.00001 &&
        (point.x === person.x || point.y === person.y));
      if (!from) return;

      const destination = person.destination;
      const blocked = new Set(aisle.cells);
      if (narrowAisleAt(destination) !== aisle && directShopper(person, destination, blocked, from)) {
        person.detourUntil = peopleTimeMs + 3 * SECOND;
        return;
      }

      const y = person.y < AISLE_TOP ? 2 : 15;
      const shoulders = aisle.shoulders.map(x => ({ x, y }));
      shoulders.sort((a,b) => distance(a, person) - distance(b, person));
      for (const shoulder of shoulders) {
        if ((robotVisible() && distance(shoulder, position) < 2.4) ||
            pedestrians.some(other => other !== person && distance(other, shoulder) < 1)) continue;
        if (!directShopper(person, shoulder, blocked, from)) continue;
        person.aisleWait = { aisle, destination };
        person.yielding = false;
        person.detourUntil = peopleTimeMs + 3 * SECOND;
        return;
      }
    }

    function walkPedestrians() {
      peopleTimeMs += TICK;
      const restocking = activeStockTicket();
      const restocker = restocking ? restockPosition(restocking[0], restocking[1].elapsed) : null;
      const actorVisible = robotVisible();
      const entryInUse = arrived?.action === 'entry' && (phaseCode === 'ENTER' || phaseCode === 'YIELD');
      const parkedOutsideEntrance = entryStart && phaseCode === 'IDLE';
      if (options.quiet !== true && !entryInUse && peopleTimeMs >= spawnAt && pedestrians.length < 3 &&
          (!actorVisible || parkedOutsideEntrance || distance(position, ENTRY) >= 2.45) &&
          pedestrians.every(person => distance(person, ENTRY) > 1.2)) {
        const stocked = SKUS.filter(sku => worldStock[sku] > 0);
        const item = stocked[Math.floor(rand() * stocked.length)] || 'BREAD';
        const person = makeShopper(item, ENTRY_THRESHOLD, 'enter');
        directShopper(person, SHOPPER_PICK[item]);
        pedestrians.push(person);
        spawnAt = peopleTimeMs + (8 + rand() * 10) * SECOND;
      }
      for (let i = pedestrians.length - 1; i >= 0; i--) {
        const person = pedestrians[i];
        if (person.stage === 'queue' || person.stage === 'pay' || peopleTimeMs < person.stopAt) continue;
        if (person.stage === 'browse' && !person.crossing && worldStock[person.item] === 0) {
          person.item = SKUS.find(sku => worldStock[sku] > 0) || 'BREAD';
          person.yielding = false;
          person.aisleWait = null;
          directShopper(person, SHOPPER_PICK[person.item]);
        }
        if (person.next >= person.route.length) {
          if (person.aisleWait) {
            const { aisle, destination } = person.aisleWait;
            if (!aisleHasHuman(aisle, person) && directShopper(person, destination)) {
              person.aisleWait = null;
              person.yielding = false;
              person.blockedSince = null;
            } else {
              person.blockedSince ??= peopleTimeMs;
            }
          } else if (person.yielding) {
            if (peopleTimeMs >= person.detourUntil) {
              person.detourUntil = peopleTimeMs + 1500;
              replanShopper(person, [
                ...(actorVisible ? [{ actor:position, clearance:1.2 }] : []),
                ...pedestrians.filter(other => other !== person).map(actor => ({ actor, clearance:0.85 })),
                ...(restocker ? [{ actor:restocker, clearance:STAFF_CLEARANCE }] : [])
              ]);
            }
          } else if (person.outside && samePoint(person, OUTSIDE)) pedestrians.splice(i, 1);
          else updateShopperStage(person);
          continue;
        }
        const next = person.route[person.next];
        const gap = distance(person, next);
        const step = Math.min(gap, person.speed * TICK / SECOND / CELL_METERS);
        const ratio = gap === 0 ? 0 : step / gap;
        const proposal = { x: person.x + (next.x - person.x) * ratio, y: person.y + (next.y - person.y) * ratio };
        const end = gap <= step + 0.00001 ? next : proposal;
        const aisle = enteringOccupiedAisle(person, end);
        if (aisle) {
          person.aisleBlocked = true;
          waitOutsideAisle(person, aisle);
          continue;
        }
        person.aisleBlocked = false;
        const obstacles = pedestrians.filter(other => other !== person).map(actor => ({ actor, clearance:0.85 }));
        const shopperExit = person.stage === 'exit';
        const actorInExit = position.x >= 21 && position.y >= 14;
        // The robot yields at its wider sensor threshold. A pedestrian can
        // pass a stopped robot while keeping the sprites physically separate.
        const robotClearance = shopperExit ? 2.4 : 1;
        if (actorVisible && (!shopperExit || actorInExit)) obstacles.push({ actor:position, clearance:robotClearance });
        if (handoff && !orderExit) obstacles.push({ actor:handoff.parked, clearance:STAFF_CLEARANCE });
        if (restocker) obstacles.push({ actor:restocker, clearance:STAFF_CLEARANCE });
        const blocking = obstacles.filter(({ actor, clearance }) =>
          distance(actor, proposal) < clearance && distance(actor, proposal) < distance(actor, person));
        if (blocking.length) {
          person.blockedSince ??= peopleTimeMs;
          const settled = peopleTimeMs >= (person.detourUntil ?? 0);
          if (!shopperExit && !person.crossing && settled && peopleTimeMs - person.blockedSince >= 1200) {
            person.blockedSince = peopleTimeMs;
            replanShopper(person, obstacles);
          }
          continue;
        }
        person.blockedSince = null;
        Object.assign(person, end);
        if (person.stage === 'enter' && person.x > ENTRY.x + 0.5) person.stage = 'browse';
        if (gap <= step + 0.00001) {
          person.next++;
          if (person.stage === 'enter' && person.next >= person.route.length) person.stage = 'browse';
        }
      }
      walkCheckoutLine();
    }

    function arriveTarget() {
      route = [];
      if (arrived.action === 'entry') return beginShopping(arrived.skipRecommendation);
      if (arrived.action === 'handoff') {
        handoff.stage = 'transfer';
        nextActionAt = timeMs + 3 * SECOND;
        setPhase('HANDOFF', '店员已到机器人旁，正在交接购物篮。');
        return;
      }
      if (arrived.action === 'pick') return verifyShelf(arrived.sku);
      if (arrived.action === 'checkout') {
        queue.push({ owner:'robot' });
        const { customersAhead:ahead, staffAway } = checkoutQueueView();
        const detail = ahead ? `加入收银队列，前面还有 ${ahead} 位顾客。`
          : staffAway ? '店员正在补货，加入收银队列等待店员返回。' : '收银台空闲，等待开始核价。';
        setPhase('CHECKOUT', detail);
        log('checkout', handoff ? '店员带购物篮到收银台' : '机器人加入收银队列', status);
        dispatchRegister();
        return;
      }
      if (arrived.action === 'exit') {
        gateAt = timeMs;
        gateReadyAt = timeMs + SECOND;
        setPhase('EXIT', '已付款，等待模拟闸机确认后跨门。');
        return;
      }
      setPhase('WAIT', promoWaiting ? '在安全区等待水果优惠生效。' : '在安全区等待补货完成。');
    }

    function clearanceDetour(spacingAt, spacing, allowPullout = false) {
      const occupied = new Set();
      for (let x = 1; x < WIDTH - 1; x++) {
        for (let y = 1; y < HEIGHT - 1; y++) {
          if (spacingAt({x,y}) < 0.8) occupied.add(pointKey({x,y}));
        }
      }
      const origins = [route[routeIndex - 1], route[routeIndex]].filter(point => point && !crossesCounter(position, point) &&
        (samePoint(point, position) || spacingAt(point) > spacing + 0.05));
      for (const key of queueLaneBlocks) occupied.add(key);
      const canRetreat = (from, to) => !checkoutLane(to) && occupied.has(pointKey(from)) && spacingAt(to) > spacingAt(from) + 0.05;
      const paths = origins.map(origin => {
        const path = astar(origin, target, occupied, canRetreat);
        return { path, index:samePoint(position, origin) ? 1 : 0 };
      }).filter(candidate => candidate.path.length > 1 && candidate.path[candidate.index] &&
        (spacing >= 0.8 || spacingAt(candidate.path[candidate.index]) > spacing + 0.05));
      paths.sort((a, b) => a.path.length - b.path.length);
      if (!paths.length) {
        if (!allowPullout) return false;
        const pullouts = origins.filter(origin => !samePoint(position, origin));
        if (samePoint(position, gridPoint(position))) {
          pullouts.push(...neighbors(position).filter(point => !checkoutLane(point) && spacingAt(point) > spacing + 0.05));
        }
        pullouts.sort((a, b) => spacingAt(b) - spacingAt(a));
        if (!pullouts.length) return false;
        route = [pullouts[0]];
        routeIndex = 0;
        pullingOut = true;
        log('safety', '退到旁边让行', '当前目标暂时被挡，机器人退到安全位置，让顾客先走。');
        return true;
      }
      route = paths[0].path;
      routeIndex = paths[0].index;
      pullingOut = false;
      const detail = returning() ? '用 A* 绕过店内顾客，仍回停靠位。' : '先朝安全方向让开，再用 A* 绕过人员；取货目标未变。';
      log('safety', '重新规划绕行', detail);
      return true;
    }

    function walk() {
      if (handoff) return walkStaff();
      const entering = arrived.action === 'entry';
      const leaving = arrived.action === 'exit';
      const stockCrew = restockView();
      const traffic = leaving ? pedestrians.filter(person => person.x >= 21 && person.y > position.y) : pedestrians;
      const obstacles = stockCrew.state === 'working' ? [...traffic, stockCrew] : traffic;
      const spacingAt = point => obstacles.reduce((closest, person) => Math.min(closest, distance(point, person) * CELL_METERS - 0.4), Infinity);
      const spacing = spacingAt(position);
      if (routeIndex >= route.length) {
        if (!pullingOut || samePoint(position, target)) return arriveTarget();
        if (timeMs - lastDetourAt >= SECOND) {
          lastDetourAt = timeMs;
          if (clearanceDetour(spacingAt, spacing)) {
            blockedSince = null;
            blockedAttempts = 0;
            setPhase('MOVE', `顾客已让开，继续前往${target.label}。`);
            return;
          }
        }
        if (timeMs - blockedSince >= 30 * SECOND) assist('通道持续阻塞，已停车并请求员工接手。');
        return;
      }
      let retreating = pullingOut;
      if (spacing < 0.8) {
        safeSamples = 0;
        if (blockedSince === null) {
          blockedSince = timeMs;
          lastDetourAt = timeMs;
          setPhase('YIELD', '前方行人或补货人员距离过近，停车让行，目标暂时保留。');
          log('safety', '停车避让', '表面间距小于 0.8 米，保留当前目标和购物篮。');
        }
        if (timeMs - blockedSince >= 30 * SECOND || blockedAttempts >= 3) return assist('通道持续阻塞，已停车并请求员工接手。');
        if (!entering && !leaving && !pullingOut && timeMs - lastDetourAt >= 5 * SECOND) {
          lastDetourAt = timeMs;
          if (!clearanceDetour(spacingAt, spacing, true)) blockedAttempts++;
        }
        retreating = pullingOut || (!entering && !leaving && timeMs - blockedSince >= 5 * SECOND && spacingAt(route[routeIndex]) > spacing + 0.03);
        if (!retreating) return;
      }
      if (blockedSince !== null && !retreating) {
        if (++safeSamples < 2) return;
        blockedSince = null;
        blockedAttempts = 0;
        setPhase(entering ? 'ENTER' : 'MOVE', `连续两次安全观测，继续前往${target.label}。`);
        log('safety', '恢复原目标', status);
      }
      const next = route[routeIndex];
      const gap = distance(position, next);
      const speed = spacing < 1.5 ? SPEED / 2 : SPEED;
      const step = Math.min(gap, speed * TICK / SECOND / CELL_METERS);
      const ratio = gap === 0 ? 0 : step / gap;
      const proposed = { x: position.x + (next.x - position.x) * ratio, y: position.y + (next.y - position.y) * ratio };
      if (obstacles.some(person => distance(proposed, person) * CELL_METERS - 0.4 < 0.75 &&
          (!retreating || distance(proposed, person) <= distance(position, person)))) return;
      position = proposed;
      walkingDistance += step * CELL_METERS;
      if (gap <= step + 0.00001) {
        position = { x: next.x, y: next.y };
        trail.push({ ...position });
        routeIndex++;
      }
    }

    function walkStaff() {
      if (routeIndex >= route.length) return arriveTarget();
      const next = route[routeIndex];
      const gap = distance(position, next);
      const step = Math.min(gap, 0.8 * TICK / SECOND / CELL_METERS);
      const ratio = gap === 0 ? 0 : step / gap;
      const proposal = { x:position.x + (next.x - position.x) * ratio, y:position.y + (next.y - position.y) * ratio };
      const end = gap <= step + 0.00001 ? next : proposal;
      const occupiedAisle = enteringOccupiedAisle(position, end, true);
      const blocked = occupiedAisle || [handoff.parked, ...pedestrians].some(person =>
        distance(proposal, person) < STAFF_CLEARANCE && distance(proposal, person) < distance(position, person));
      if (blocked) {
        if (blockedSince === null) {
          blockedSince = timeMs;
          setPhase('YIELD', occupiedAisle ? '货架间已有顾客，店员等对方离开后再进入。' : '店员先让行，等通道可以安全通过。');
          log('safety', '店员停步让行', status);
        }
        if (timeMs - blockedSince >= 30 * SECOND) return assist('店员前方通道仍然堵塞，保留订单和付款记录，等待后续处理。');
        if (timeMs - (lastDetourAt ?? -Infinity) >= SECOND) {
          lastDetourAt = timeMs;
          const from = gridPoint(position);
          const alternate = staffRoute(from, target, pedestrians, arrived.action === 'exit', occupiedAisle);
          if (alternate.length && !crossesCounter(position, from)) {
            route = alternate;
            routeIndex = samePoint(position, from) ? 1 : 0;
          }
        }
        return;
      }
      if (blockedSince !== null) {
        blockedSince = null;
        setPhase('MOVE', `通道已安全，店员继续前往${target.label}。`);
      }
      position = { ...end };
      walkingDistance += step * CELL_METERS;
      if (samePoint(position, next)) {
        trail.push({ ...position });
        routeIndex++;
      }
    }

    function issueRestock(sku) {
      if (tickets[sku] && !tickets[sku].completed) return;
      tickets[sku] = { at: timeMs + restockDelay, idleMs: 0, waitCutoff: Infinity, started: false, completed: false };
      log('stock', `${names(sku)}缺货 · 建立补货单`, `现场数量不足，预计 ${timeLabel(tickets[sku].at)} 收到补货通知。预计时间只供安排，不能提前入篮。`);
    }

    function activeStockTicket() {
      return outcome ? undefined : Object.entries(tickets).find(([, ticket]) => ticket.started && !ticket.completed);
    }

    function dueStockTicket() {
      if (outcome || paid) return undefined;
      if (handoff) return activeStockTicket();
      return activeStockTicket() || Object.entries(tickets).find(([, ticket]) =>
        !ticket.completed && timeMs >= ticket.at - STOCK_WORK_MS);
    }

    function restockPosition(sku, elapsed) {
      const { x, y } = products[sku];
      const progress = elapsed / STOCK_WORK_MS;
      const journey = Math.min(1, progress * 2.5, (1 - progress) * 2.5);
      // The employee crosses the clear front corridor first, then follows the
      // product's pickup aisle up to the cabinet. Both legs stay off fixtures.
      const across = STAFF_COUNTER.x - x;
      const along = STAFF_COUNTER.y - y;
      const traveled = (across + along) * journey;
      return { x: STAFF_COUNTER.x - Math.min(across, traveled),
        y: STAFF_COUNTER.y - Math.max(0, traveled - across), progress };
    }

    function restockView() {
      const jobs = Object.entries(tickets);
      const [sku, ticket] = activeStockTicket() ||
        jobs.find(([, job]) => !job.completed) || jobs.at(-1) || ['MILK', null];
      if (!ticket) return { state: 'none', sku, x: null, y: null, progress: 0, etaMs: null };
      if (ticket.completed) return { state: 'completed', sku, x: null, y: null, progress: 1, etaMs: ticket.at };
      if (!ticket.started || outcome) return { state: 'waiting', sku, x: null, y: null, progress: 0, etaMs: ticket.at };
      const pose = restockPosition(sku, ticket.elapsed);
      return { state: 'working', sku, ...pose, etaMs: ticket.at, aisle:narrowAisleAt(pose)?.id ?? null,
        aisleWaiting:Boolean(ticket.aisleClaim) };
    }

    function verifyShelf(sku) {
      knownStock[sku] = worldStock[sku];
      const count = Math.min(left(sku), worldStock[sku]);
      if (count <= 0) {
        issueRestock(sku);
        setPhase('PLAN', `${names(sku)}现场无货，先看有没有其他任务。`);
        return;
      }
      const price = getPrice(sku, timeMs);
      if (price > caps[sku]) {
        const projected = basketTotal() + totalFor(Object.fromEntries(needed().map(id => [id, left(id)])), id => getPrice(id, timeMs));
        if (projected > budget) return requestDeletion([sku], '当前报价已超预算。');
        return requestChoice('reprice', `${names(sku)}当前报价 ${price} 元，高于授权的 ${caps[sku]} 元。是否接受新报价？`,
          { skus: [sku], prices: { [sku]: price } }, latestReply());
      }
      if (basketMass() + count * products[sku].weight > LOAD_MAX) return assist('实取载重将超限，停止取货。');
      arrived.quantity = count;
      nextActionAt = timeMs + count * PICK_MS;
      setPhase('PICK', `核对${names(sku)}数量，取货并等待库存回执。`);
    }

    function finishPick() {
      const { sku, quantity } = arrived;
      const count = Math.min(quantity, left(sku), worldStock[sku]);
      if (count > 0) {
        if (getPrice(sku, timeMs) > caps[sku]) return verifyShelf(sku);
        worldStock[sku] -= count;
        knownStock[sku] = worldStock[sku];
        basket[sku] = (basket[sku] || 0) + count;
        if (sku === 'FRUIT' && fruitPickedAt === null) fruitPickedAt = nextActionAt - (count - 1) * PICK_MS;
        log('pick', `${handoff ? '店员' : ''}实取${names(sku)} ×${count}`, `取货和库存回执都成功，购物篮现重 ${basketMass()} 克。`);
      }
      if (left(sku) > 0) issueRestock(sku);
      setPhase('PLAN', '购物篮已更新，重新选择下一站。');
    }

    function processRestock() {
      const work = dueStockTicket();
      if (!work) return;
      const [sku, ticket] = work;
      if (!ticket.started) {
        if (register) return;
        ticket.started = true;
        ticket.elapsed = 0;
        ticket.at = Math.max(ticket.at, timeMs + STOCK_WORK_MS);
        log('stock', `${names(sku)}货架正在补货`, '店员从收银台推车去补货，收银暂候。等补货完成并清空通道后再返架。');
        return;
      }
      const elapsed = Math.min(ticket.elapsed + TICK, STOCK_WORK_MS);
      const before = restockPosition(sku, ticket.elapsed);
      const next = restockPosition(sku, elapsed);
      const occupiedAisle = enteringOccupiedAisle(before, next, true);
      const tooClose = pedestrians.some(person => distance(next, person) < STAFF_CLEARANCE &&
        distance(next, person) < distance(before, person));
      if (occupiedAisle || tooClose) {
        ticket.at += TICK;
        ticket.aisleClaim = occupiedAisle || ticket.aisleClaim;
        if (ticket.aisleClaim && !ticket.aisleWaitLogged) {
          ticket.aisleWaitLogged = true;
          log('stock', '补货员在通道外等候', '货架间已有顾客，等对方走出后再进入，补货时间随等候顺延。');
        }
        return;
      }
      ticket.aisleClaim = null;
      ticket.elapsed = elapsed;
      if (elapsed < STOCK_WORK_MS || timeMs < ticket.at) return;
      ticket.completed = true;
      worldStock[sku] += 4;
      knownStock[sku] = worldStock[sku];
      const accepting = phaseCode !== 'ASSIST' && left(sku) > 0 && ticket.idleMs < WAIT_MS && timeMs < ticket.waitCutoff &&
        !(pending?.kind === 'delete' && pending.skus.includes(sku));
      log('stock', `收到${names(sku)}补货通知`, accepting
        ? '模拟货架增加 4 件，通道确认清空，店员回到收银台。回到货架复核后才能取货。' : '店员已返回收银台。补货通知作为库存事实记录，过期或已关闭的任务不会自动恢复。');
      if (accepting && phaseCode === 'WAIT' && !promoWaiting) setPhase('PLAN', '收到补货回执，重新规划返架核验。');
    }

    function processWait() {
      const atWaitPoint = phaseCode === 'WAIT';
      const arrivalAt = atWaitPoint ? timeMs : timeMs + travel(position, WAIT_POINT);
      if (promoWaiting) {
        const departureAt = Math.max(PROMO_START, arrivalAt);
        promoDeadline = Math.min(promoDeadline, waitCutoff(WAIT_POINT, departureAt, needed(), 'FRUIT', 'expected'));
        const cannotWait = departureAt >= promoDeadline;
        if (cannotWait || (atWaitPoint && timeMs >= PROMO_START)) {
          promoEvaluated = true;
          promoWaiting = false;
          log('promo', cannotWait ? '剩余时间不足以继续等待' : '水果八折生效',
            `结束等待，按此刻的实际价格 ${getPrice('FRUIT', timeMs)} 元和剩余时间重新规划。`);
          setPhase('PLAN', '促销等待结束，重新核价和规划。');
        }
        return;
      }
      const open = needed().filter(sku => tickets[sku] && !tickets[sku].completed);
      if (!open.length) return setPhase('PLAN', '当前等待结束，重新规划。');
      tightenRestockCutoff(open, arrivalAt);
      if (atWaitPoint) {
        for (const sku of open) tickets[sku].idleMs += TICK;
      }
      const expired = open.filter(sku => tickets[sku].idleMs >= WAIT_MS || timeMs >= tickets[sku].waitCutoff);
      if (expired.length) requestDeletion(expired, '已达到补货等待上限或最晚询问时刻。', true);
    }

    function processCheckout() {
      if (register?.owner !== 'robot' || !samePoint(position, CASHIER)) {
        const { customersAhead:ahead, staffAway } = checkoutQueueView();
        status = staffAway ? '店员正在补货，返回收银台后按入队先后结账。'
          : ahead ? `前面还有 ${ahead} 位顾客，按入队先后等收银。`
            : register?.owner === 'robot' ? '已轮到当前订单，沿共用队列前往收银台。' : '在共用队列等待收银台空出。';
        if (checkoutFinishEstimate(timeMs) > tillCheckout()) assist('当前队列预计无法在生鲜或离店时限内完成结账。');
        return;
      }
      if (needed().length) {
        releaseRobotRegister();
        return setPhase('PLAN', '仍有未关闭任务，返回规划。');
      }
      log('checkout', handoff ? '店员开始为订单结账' : '轮到机器人结账', '收银台已可使用，按队列顺序开始核价。');
      const expected = basketTotal();
      const paymentAt = timeMs + ROBOT_CHECKOUT_MS;
      const nextPriceBumps = Object.keys(basket).filter(sku => Math.max(getPrice(sku, timeMs), getPrice(sku, paymentAt)) > caps[sku]);
      if (expected > budget || paymentAt > tillCheckout()) return assist('当前报价或剩余时间无法安全结账。');
      if (nextPriceBumps.length) {
        const prices = Object.fromEntries(nextPriceBumps.map(sku => [sku, Math.max(getPrice(sku, timeMs), getPrice(sku, paymentAt))]));
        const quote = totalFor(basket, sku => prices[sku] ?? getPrice(sku, timeMs));
        if (quote > budget) return assist('新报价超过预算，需要员工处理。');
        return requestChoice('reprice', `部分价格上涨，购物篮新报价 ${quote} 元。是否接受？`, { skus: nextPriceBumps, prices }, latestReply());
      }
      nextActionAt = paymentAt;
      setPhase('PAID', '购物篮已冻结，正在等待模拟付款回执。');
      log('checkout', '核价通过并发起付款', `当前购物篮 ${expected} 元。收到成功回执才记为已付款。`);
    }

    function processPayment() {
      if (timeMs < nextActionAt) return;
      const amount = basketTotal();
      if (timeMs > tillCheckout() || amount > budget || Object.keys(basket).some(sku => getPrice(sku, timeMs) > caps[sku])) {
        return assist('付款截止或报价条件未满足，没有发出成功回执。');
      }
      paid = true;
      paidAmount = amount;
      log('checkout', '收到模拟付款成功回执', `实付 ${amount} 元，继续导航到出口。付款后还要等闸机和跨门确认。`);
      setPhase('PLAN', '已付款，规划前往出口。');
    }

    function processGate() {
      const gateLimit = handoff ? gateAt + GATE_MS : Math.min(gateAt + GATE_MS, deadline - 2 * SECOND);
      if (timeMs >= gateLimit) return assist('闸机放行或离店时间已到，保留已付款状态。');
      if (timeMs < gateReadyAt) return;
      if (pedestrians.some(person => person.y > position.y && person.x >= 21 && distance(position, person) * CELL_METERS - 0.4 < 0.8)) {
        status = '闸机通道附近有人，保持已付款状态并等待安全通过。';
        return;
      }
      if (target.y !== OUTSIDE.y) {
        target = { ...OUTSIDE, x:target.x };
        log('checkout', '闸机确认放行', '从门内服务点开始跨门。');
      }
      const step = SPEED * TICK / SECOND / CELL_METERS;
      const moved = Math.min(step, OUTSIDE.y - position.y);
      position = { x: target.x, y: position.y + moved };
      walkingDistance += moved * CELL_METERS;
      if (position.y < OUTSIDE.y - 0.00001) return;
      releaseRobotRegister();
      trail.push({ ...position });
      outcome = SKUS.every(sku => (basket[sku] || 0) >= (originalItems[sku] || 0)) ? 'FULL' : 'PARTIAL';
      const actor = handoff ? '店员' : '机器人';
      const result = outcome === 'FULL' ? '原清单全部满足' : '原清单部分完成';
      const late = handoff && timeMs >= deadline ? '（超过原定离店时间）' : '';
      orderExit = { actor, timeMs, x:position.x, y:position.y };
      const detail = `付款成功，${actor}已从出口离店${late}，${result}。`;
      log('finish', outcome === 'FULL' ? '离店 · 全部完成' : '离店 · 部分完成', detail);
      if (handoff) {
        beginReturn();
      } else {
        arrived = null;
        target = null;
        route = [];
        setPhase('DONE', detail);
      }
    }

    function finishReturn() {
      route = [];
      target = null;
      setPhase('DONE', '机器人已停回入口旁的停靠位，购物和返航结束。');
      log('navigation', '返回停靠位', status);
    }

    function stopReturn() {
      route = [];
      target = null;
      setPhase('DONE', '店员已完成订单。返航通道受阻，机器人已原地停车，等待店员处理。');
      log('safety', '返航受阻并停车', status);
    }

    function beginReturn() {
      arrived = null;
      blockedSince = null;
      lastDetourAt = null;
      pullingOut = false;
      position = { ...handoff.parked };
      if (samePoint(position, DOCK)) return finishReturn();
      let path = navigationRoute(gridPoint(position), DOCK);
      if (position.x < ENTRY.x && position.y === ENTRY.y) {
        path = [...OUTSIDE_ENTRY_ROUTE.slice(0, -1).filter(point => point.x > position.x), ...DOCK_ENTRY_ROUTE.slice().reverse()];
      } else if (position.x === EXIT.x && position.y > EXIT.y) {
        path = [...(position.y > EXIT_THRESHOLD.y ? [EXIT_THRESHOLD] : []), ...navigationRoute(EXIT, DOCK)];
      }
      route = [{ ...position }, ...path.filter((point, index) => index !== 0 || !samePoint(position, point))];
      routeIndex = 1;
      target = { ...DOCK };
      setPhase('RETURN', '店员已完成订单，机器人从原停车点回到停靠位。');
      log('navigation', '开始返航', status);
    }

    function processReturn() {
      if (samePoint(position, DOCK)) return finishReturn();
      if (timeMs - orderExit.timeMs >= 120 * SECOND) return stopReturn();
      const next = route[routeIndex];
      const gap = next ? distance(position, next) : 0;
      const step = Math.min(gap, SPEED * TICK / SECOND / CELL_METERS);
      const ratio = gap === 0 ? 0 : step / gap;
      const proposed = next && { x:position.x + (next.x - position.x) * ratio, y:position.y + (next.y - position.y) * ratio };
      const spacingAt = point => pedestrians.reduce((closest, person) => Math.min(closest, distance(point, person) * CELL_METERS - 0.4), Infinity);
      const blocked = !proposed || pedestrians.some(person => distance(proposed, person) * CELL_METERS - 0.4 < 0.8 &&
        distance(proposed, person) < distance(position, person));
      if (blocked) {
        if (blockedSince === null) {
          blockedSince = timeMs;
          lastDetourAt = timeMs;
          log('safety', '返航先让行', '前方有顾客，机器人暂时停车。');
        }
        status = '返航路上有顾客，机器人先让行。';
        if (timeMs - blockedSince >= 30 * SECOND) return stopReturn();
        if (timeMs - lastDetourAt >= 2 * SECOND) {
          lastDetourAt = timeMs;
          if (clearanceDetour(spacingAt, spacingAt(position), true)) {
            status = pullingOut ? '机器人先退到旁边让行，再规划返回停靠位。' : '重新规划绕开顾客，继续返回停靠位。';
          }
        }
        return;
      }
      if (blockedSince !== null && step > 0) {
        blockedSince = null;
        status = '通道已让开，继续返回停靠位。';
      }
      position = proposed;
      if (gap > step + 0.00001) return;
      position = { x:next.x, y:next.y };
      routeIndex++;
      if (samePoint(position, DOCK)) finishReturn();
    }

    function tick(ms = TICK) {
      if (!Number.isFinite(ms) || ms <= 0) return;
      remainder += Math.min(ms, 30 * MINUTE);
      while (remainder >= TICK && active()) {
        remainder -= TICK;
        timeMs += TICK;
        walkPedestrians();
        if (returning()) {
          processReturn();
          continue;
        }
        if (promoEnabled && timeMs === PROMO_START && !promoWaiting) {
          log('promo', '水果八折生效', '鲜切水果从 30 元变为 24 元，按结账时有效价格结算。');
        }
        if (phaseCode === 'ASSIST') {
          processRestock();
          continue;
        }
        if (phaseCode === 'HANDOFF') {
          if (handoff.stage === 'dispatch') {
            processRestock();
            dispatchStaff();
          } else if (timeMs >= nextActionAt) {
            handoff.stage = 'shopping';
            const detail = paid ? '原订单已付款，店员拿着购物篮去出口。'
              : '原购物篮已交给店员，接下来处理剩余商品，再按实际购物篮结账。';
            setPhase('PLAN', detail);
            log('warning', '店员已接过购物篮', detail);
          }
          continue;
        }
        if (pending?.waitSafety) pending.expiresAt = Math.min(pending.expiresAt, waitReplyDeadline(position, timeMs));
        if (pending && pending.expiresAt !== null && timeMs >= pending.expiresAt) {
          if (pending.kind === 'recommend') {
            pending = null;
            log('choice', '推荐未确认', '顾客没有接受，保留原始清单。');
            setPhase('PLAN', '按原清单继续购物。');
          } else {
            assist('顾客确认已过期，未自动同意。');
          }
          continue;
        }
        const staffCollectingBasket = handoff?.stage === 'approach';
        if (!staffCollectingBasket && (!(handoff && paid) && timeMs >= deadline ||
            (!paid && fruitPickedAt !== null && timeMs > fruitPickedAt + FRESH_MS))) {
          assist('已达到生鲜或离店硬时限，停止当前流程。');
          continue;
        }
        if (phaseCode === 'WAIT' || (phaseCode === 'MOVE' || phaseCode === 'YIELD') && arrived?.action === 'wait') processWait();
        processRestock();
        if (pending) continue;
        if (phaseCode === 'PLAN') plan();
        else if (phaseCode === 'ENTER' || phaseCode === 'MOVE' || phaseCode === 'YIELD') walk();
        else if (phaseCode === 'PICK' && timeMs >= nextActionAt) finishPick();
        else if (phaseCode === 'CHECKOUT') processCheckout();
        else if (phaseCode === 'PAID') processPayment();
        else if (phaseCode === 'EXIT') processGate();
      }
      if (!active()) remainder = 0;
    }

    function getView() {
      const restock = restockView();
      const robotPosition = handoff && !orderExit ? handoff.parked : position;
      const staff = restock.state === 'working'
        ? { role:'restock', x:restock.x, y:restock.y, active:true }
        : handoff && !orderExit && handoff.stage !== 'dispatch'
          ? { role:'handoff', ...position, stage:{ MOVE:'walk', PICK:'pick', CHECKOUT:'checkout', PAID:'pay', EXIT:'walk' }[phaseCode] || 'standing',
              carrying:handoff.stage === 'shopping', item:target?.sku }
          : { role:'checkout', ...STAFF_COUNTER, active:Boolean(register), serving:register?.owner || null };
      staff.aisle = narrowAisleAt(staff)?.id ?? null;
      return {
        scenario, mode, seed, modelVersion: MODEL_VERSION, phase: PHASE[phaseCode], phaseCode, status,
        active: active(), returning:returning(), timeMs, peopleTimeMs, time: timeLabel(timeMs), position: { ...robotPosition },
        dock: { ...DOCK }, docked: samePoint(robotPosition, DOCK), entryStart, robotVisible:robotVisible(),
        orderExit: orderExit && { ...orderExit },
        handoff:handoff?.stage || null,
        route: route.map(point => ({ ...point })), trail: trail.map(point => ({ ...point })), target: target && { ...target },
        pedestrians: pedestrians.map(person => {
          const { x, y, kind, variant, id, stage, item } = person;
          const stopped = person.next >= person.route.length;
          const aisleWaiting = Boolean(person.aisleBlocked || person.aisleWait && stopped);
          const motion = aisleWaiting || person.blockedSince != null || person.yielding && stopped ? 'waiting'
            : !stopped && (person.aisleWait || person.detourUntil > peopleTimeMs) ? 'detour' : null;
          return { x, y, kind, variant, id, stage:stage === 'approachQueue' ? 'queue' : stage, item, motion, aisleWaiting,
            aisle:narrowAisleAt(person)?.id ?? null };
        }),
        checkoutQueue:checkoutQueueView(),
        stock: { ...knownStock }, worldStock: { ...worldStock }, stockoutSku, restock, staff,
        basket: { ...basket }, items: { ...items }, originalItems: { ...originalItems }, removed: { ...removed },
        mass: basketMass(), total: paid ? paidAmount : basketTotal(), paid, outcome, budget,
        deadline: deadline || null, walkingDistance, promoEnabled, promoActive: promoIsActive(timeMs),
        fruitPrice: getPrice('FRUIT', timeMs), promoStartsAt: PROMO_START,
        pending: pending && { ...pending }, logs: [...logs], decision, decisionHistory:[...decisionHistory]
      };
    }

    function tickIdle(ms = TICK) {
      if (active() || !Number.isFinite(ms) || ms <= 0) return;
      peopleRemainder += Math.min(ms, MINUTE);
      while (peopleRemainder >= TICK) {
        peopleRemainder -= TICK;
        walkPedestrians(false);
      }
    }

    return { submit, tick, tickIdle, answer, getView };
  }

  return { create, products, presets, timeLabel, maxWeight: LOAD_MAX, astar, modelVersion: MODEL_VERSION, modelInfo: MODEL_INFO };
});

(() => {
  'use strict';
  const $ = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), node => [node.id, node]));
  const engineApi = window.PixelStoreEngine;
  const artApi = window.PixelStoreArt;
  if (!engineApi || !artApi) {
    $.submit.disabled = true;
    $['phone-open'].disabled = true;
    $['form-message'].textContent = '地图或模拟程序未载入，请重新打开完整网页。';
    return;
  }

  const orderOfProducts = ['EGG', 'BREAD', 'FRUIT', 'MILK'];
  const products = engineApi.products;
  const shortNames = { EGG:'鸡蛋', MILK:'牛奶', BREAD:'面包', FRUIT:'鲜切水果' };
  const units = { EGG:'盒', MILK:'盒', BREAD:'袋', FRUIT:'盒' };
  const icons = {
    EGG:'<path fill="#9c6551" d="M3 8h22v4H3zm1 11h20v4H4z"/><path fill="#bf8569" d="M3 12h22v7H3z"/><path fill="#f8e4bb" d="M6 9h2V6h4v2h2v6H6zm9 1h2V7h4v2h2v6h-8z"/><path fill="#f1bb90" d="M4 17h20v2H4z"/>',
    MILK:'<path fill="#41657b" d="M6 8h16v16H6z"/><path fill="#9bbac8" d="M9 4h10l3 4H6z"/><path fill="#fff5d9" d="M8 9h12v7H8z"/><path fill="#75a0c4" d="M8 16h12v6H8z"/><path fill="#ecf6eb" d="M12 17h4v4h-4z"/>',
    BREAD:'<path fill="#92553e" d="M3 12h2V8h4V5h11v2h3v4h2v8h-3v3H7v-2H3z"/><path fill="#dfa758" d="M5 12h3V8h12v2h3v8h-2v2H7v-2H5z"/><path fill="#ffe7a7" d="M9 10h2v6H9zm5-1h2v6h-2zm5 1h2v5h-2z"/>',
    FRUIT:'<path fill="#758872" d="M3 9h22v12h-2v2H5v-2H3z"/><path fill="#f1ebcc" d="M5 10h18v9H5z"/><path fill="#da7d56" d="M7 12h5v5H7zm9 2h5v4h-5z"/><path fill="#dca557" d="M13 11h6v3h-6z"/><path fill="#9cab70" d="M12 16h3v3h-3z"/>'
  };
  const hints = {
    showcase:'已选蛋、奶和水果。下单后看顾客走动、员工补奶和 18:00 的水果折扣。本场补货用 90 秒。',
    normal:'可用快捷清单，也可以自己选商品。默认库存充足，顾客照常购物。',
    restock:'选一种缺货商品。看员工补货后，机器人如何返回货架核验。',
    late:'选一种缺货商品。等不到补货时，手机会询问是否删去缺货商品。',
    promo:'已选鲜切水果。18:00 从 ¥30 降到 ¥24，观察机器人是否值得等。',
    crowd:'正常购物也会让行。本场特意安排顾客横穿路线，方便观察停车、恢复和绕行。',
    handoff:'正常购物持续受阻也会请求员工。本场固定客流，收到请求后点「派店员接手」，看接篮、补取和结账。',
    compare:'用同一份蛋奶清单分别跑两次，切换 CART 和库存规则，比较机器人先去哪一个货架。'
  };

  const art = artApi.create($['store-map']);
  // One seed per browser refresh. Reset and comparison replay that same crowd.
  const pageSeed = typeof window.crypto?.getRandomValues === 'function'
    ? window.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 4294967296);
  let engine;
  let startAtEntrance = false;
  const standardCart = { EGG:1, MILK:1, BREAD:0, FRUIT:0 };
  let cart = { ...standardCart };
  let paused = false;
  let locked = false;
  let zoom = 1;
  let grid = false;
  let showLabels = false;
  let carry = 0;
  let priorFrame;
  let priorSignature = '';
  let priorPending = '';
  let pickupBadge = null;
  let previousBasket = {};
  let shownProductKey = '';
  let previousRouteView = null;
  let explainedLogCount = 0;
  let routeMoment = null;
  let shopperSignature = '';
  let renderedLogCount = -1;
  let resultShown = false;
  const fields = [$.scenario, $['stockout-sku'], $.budget, $.deadline, $['risk-mode'], $['preset-a'], $['preset-b']];
  const rows = {};

  function money(value) {
    return '¥' + Number(value || 0).toLocaleString('zh-Hans', { maximumFractionDigits:2 });
  }

  function clock(ms) {
    const s = 17 * 3600 + 50 * 60 + Math.floor(Math.max(0, ms || 0) / 1000);
    return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2,'0')).join(':');
  }

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  for (const sku of orderOfProducts) {
    const row = node('div', undefined, 'product');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox','0 0 28 28');
    icon.setAttribute('class','sku-icon');
    icon.setAttribute('data-sku',sku);
    icon.setAttribute('shape-rendering','crispEdges');
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML = icons[sku];
    const details = node('div');
    const detail = node('span', money(products[sku].price) + ' · ' + products[sku].weight + 'g', 'product-sub');
    details.append(node('span', shortNames[sku], 'product-title'), detail);
    const qty = node('div', undefined, 'qty');
    const minus = node('button','−');
    const plus = node('button','+');
    const count = node('output','0');
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', '减少' + shortNames[sku]);
    plus.setAttribute('aria-label', '增加' + shortNames[sku]);
    minus.addEventListener('click', () => setQuantity(sku, cart[sku] - 1));
    plus.addEventListener('click', () => setQuantity(sku, cart[sku] + 1));
    qty.append(minus, count, plus);
    row.append(icon, details, qty);
    $.products.append(row);
    rows[sku] = { row, count, minus, plus, detail };
  }

  function setQuantity(sku, quantity) {
    cart[sku] = Math.max(0, Math.min(20, quantity));
    $['form-message'].textContent = '';
    renderCart();
  }

  function renderCart() {
    let mass = 0;
    let total = 0;
    for (const sku of orderOfProducts) {
      const { row, count, minus, plus } = rows[sku];
      const quantity = cart[sku];
      count.value = quantity;
      row.classList.toggle('selected', quantity > 0);
      minus.disabled = locked || quantity === 0;
      plus.disabled = locked || quantity >= 20;
      mass += quantity * products[sku].weight;
      total += quantity * products[sku].price;
    }
    $['planned-price'].textContent = money(total);
    $['planned-weight'].textContent = mass + ' / 3000 克';
    $['planned-weight'].parentElement.classList.toggle('is-over',mass > 3000);
  }

  function setLock(value) {
    locked = value;
    $['cart-controls'].hidden = value;
    $['order-basket'].hidden = !value;
    for (const field of fields) field.disabled = value;
    $.submit.disabled = value;
    $.submit.replaceChildren(document.createTextNode(value ? '订单已提交' : $.scenario.value === 'showcase' ? '开始综合演示' : '提交订单'), node('span', value ? '✓' : '↗'));
    renderCart();
  }

  function isStockoutScenario() {
    return $.scenario.value === 'restock' || $.scenario.value === 'late';
  }

  const phone = $['phone-dialog'];
  const phoneButton = $['phone-open'];
  const rules = $['rules-dialog'];
  const rulesButton = $['rules-open'];
  const resultDialog = $['result-dialog'];

  function openPhone() {
    if (phone.open) return;
    phone.showModal();
    phoneButton.setAttribute('aria-expanded','true');
    $['phone-body'].scrollTop = 0;
    if (!$.response.hidden) $.approve.focus({ preventScroll:true });
  }

  function closePhone() {
    if (phone.open) phone.close();
  }

  function canReorder(view) {
    return view.phaseCode === 'DONE' && ['FULL','PARTIAL'].includes(view.outcome);
  }

  function reset() {
    if (resultDialog.open) resultDialog.close();
    resultShown = false;
    $['phone-result'].hidden = true;
    engine = engineApi.create({
      scenario:$.scenario.value, seed:pageSeed, mode:$['risk-mode'].value,
      stockoutSku:$['stockout-sku'].value, entryStart:startAtEntrance
    });
    $['incident-controls'].hidden = !isStockoutScenario();
    paused = false;
    priorSignature = '';
    priorPending = null;
    pickupBadge = null;
    previousBasket = {};
    shownProductKey = '';
    previousRouteView = null;
    explainedLogCount = 0;
    routeMoment = null;
    shopperSignature = '';
    renderedLogCount = -1;
    $['map-product'].hidden = true;
    carry = 0;
    setLock(false);
    $.pause.disabled = true;
    $.pause.textContent = '暂停';
    $['form-message'].textContent = '';
    $['scenario-hint'].textContent = hints[$.scenario.value] || '';
    $['model-badge'].textContent = $['risk-mode'].value === 'cart' ? 'CART · 模拟库存训练' : '库存规则 · 对照';
    draw(performance.now(), true);
  }

  function launch() {
    if (locked) return;
    const budget = Number($.budget.value);
    const leaveBy = $.deadline.value;
    if (!Number.isFinite(budget) || budget <= 0 || !leaveBy) {
      $['form-message'].textContent = '请填写正数预算和最晚离店时间。';
      return;
    }
    const items = Object.fromEntries(Object.entries(cart).filter(([, qty]) => qty > 0));
    if (isStockoutScenario() && !items[$['stockout-sku'].value]) {
      $['form-message'].textContent = '请把设为缺货的商品加进清单，才能演示它的处理过程。';
      return;
    }
    if ($.scenario.value === 'handoff') {
      engine = engineApi.create({ scenario:'handoff', mode:$['risk-mode'].value, entryStart:startAtEntrance });
    }
    const result = engine.submit({ items, budget, leaveBy, allowSubstitution:false, skipRecommendation:$.scenario.value === 'showcase' });
    if (!result.ok) {
      $['form-message'].textContent = result.error || '请检查商品、预算和载重。';
      return;
    }
    carry = 0;
    setLock(true);
    $.pause.disabled = false;
    $['form-message'].textContent = '';
    draw(performance.now(), true);
    closePhone();
  }

  function renderBasket(view) {
    const lines = orderOfProducts.filter(sku => Number(view.basket?.[sku] || 0) > 0)
      .map(sku => {
        const line = node('li');
        line.append(node('span', shortNames[sku]), node('span', '×' + view.basket[sku] + ' ' + units[sku]));
        return line;
      });
    $['basket-lines'].replaceChildren(...(lines.length ? lines : [node('li','取到商品后更新','empty')]));
    const outcome = {
      FULL:view.handoff ? '店员已买齐 · 离店' : '已买齐 · 离店',
      PARTIAL:view.handoff ? '店员已离店 · 部分完成' : '部分完成 · 离店',
      HANDOFF:'人工订单待处理'
    }[view.outcome];
    $['basket-status'].textContent = outcome || (view.paid ? '已付款' : view.handoff ? '店员处理中' : locked ? '订单进行中' : '未下单');
    $['basket-total-label'].textContent = view.paid ? '实际支付' : '篮内金额';
    $['basket-total'].textContent = money(view.total);
    const purchased = ['FULL','PARTIAL'].includes(view.outcome);
    const ready = canReorder(view);
    $['reorder-actions'].hidden = !purchased;
    $['phone-reorder'].disabled = !ready;
    $['reorder-note'].textContent = ready ? '上一单已结束。调整清单后，机器人会从入口开始下一单。'
      : '机器人回到停靠位后可重新下单。若已暂停，请回地图继续播放。';
    $.pause.disabled = !locked || !view.active;
  }

  function currentSku(view) {
    if (!view.target) return null;
    return view.target.sku || orderOfProducts.find(sku => products[sku].x === view.target.x && products[sku].y === view.target.y) || null;
  }

  function describeRoute(view) {
    const previous = previousRouteView;
    const logs = view.logs || [];
    const freshLogs = logs.slice(explainedLogCount);
    const findEvent = (kind, word) => freshLogs.findLast(log => log.kind === kind && log.title.includes(word));
    const stockout = findEvent('stock', '建立补货单');
    const restocked = findEvent('stock', '补货通知');
    const detour = findEvent('safety', '重新规划绕行');
    const yielded = findEvent('safety', '停车避让');
    const joinedCheckout = findEvent('checkout', '加入收银队列');
    const checkoutTurn = findEvent('checkout', '轮到机器人结账');
    const target = view.target;
    const sku = currentSku(view);
    const targetKey = target && target.x + ',' + target.y;
    const movedTarget = targetKey && targetKey !== previous?.targetKey;
    const steps = Math.max(0, view.route.length - 1);
    const first = view.route[0];
    const directSteps = first && target ? Math.abs(first.x - target.x) + Math.abs(first.y - target.y) : steps;
    const pathNote = steps > directSteps ? '货架及安全边界是禁行区，沿通道绕行 ' + steps + ' 格。'
      : '沿可通行过道走 ' + steps + ' 格。';

    if (view.phaseCode === 'RETURN') {
      routeMoment = { kind:'ready', label:'返航停靠', title:'机器人正在返回入口旁的停靠位',
        text:'店员已完成离店。机器人从原停车点沿店内通道返回停靠位。' };
    } else if (view.phaseCode === 'DONE') {
      const title = view.docked ? '机器人已停靠' : view.orderExit?.actor === '店员' ? '机器人在店内安全停稳' : '机器人已离店';
      routeMoment = { kind:'ready', label:'行程结果', title, text:view.status };
    } else if (view.outcome) {
      routeMoment = { kind:'ready', label:'行程结果', title:view.phase, text:view.status };
    } else if (view.handoff) {
      const title = view.target?.label
        ? (view.target.label === '已离店' ? '店员正在通过出口' : '当前目标 · ' + view.target.label)
        : '店员处理原订单';
      routeMoment = { kind:'ready', label:'人工接手', title, text:view.status };
    } else if (detour && target) {
      const obstacles = [...view.pedestrians];
      if (view.restock?.state === 'working') obstacles.push(view.restock);
      routeMoment = { kind:'detour', label:'改路线', title:'目的地仍是' + target.label,
        text:'现场通道被占用，A* 已重算。灰色虚线是绕行前的路线。', targetKey,
        priorRoute:previous?.targetKey === targetKey ? previous.route : null,
        blocked:obstacles.map(({x,y}) => ({x:Math.round(x),y:Math.round(y)})) };
    } else if (stockout) {
      const stockSku = Object.keys(products).find(item => stockout.title.startsWith(products[item].name));
      const name = shortNames[stockSku] || '目标商品';
      const count = view.stock?.[stockSku];
      const priorCount = previous?.stock?.[stockSku];
      const shelf = products[stockSku];
      const fact = Number.isFinite(priorCount) && priorCount !== count ? '账面 ' + priorCount + ' 件，现场 ' + count + ' 件。' : '现场库存不足，已提交补货单。';
      routeMoment = { kind:'target', label:'换目标', title:name + '暂时取不到',
        text:fact + (sku && sku !== stockSku ? '先去' + target.label + '，补货后再复核。' + pathNote : '改做其他可执行任务，或去安全区等候。'),
        previousTarget:shelf ? {x:shelf.x,y:shelf.y} : null };
    } else if (restocked && /通道确认清空/.test(restocked.text)) {
      const returnSku = Object.keys(products).find(item => restocked.title.includes(products[item].name));
      const name = shortNames[returnSku] || '商品';
      routeMoment = { kind:'restock', label:'补货回执', title:name + '可以重新安排取货',
        text:'收到补货完成消息，通道也已清空。' + (sku === returnSku && steps ? '沿可通行过道返架 ' + steps + ' 格，到架再核验。' : '根据剩余任务重新安排，到架核验后才入篮。') };
    } else if (movedTarget && target.label === '等候区') {
      const promo = view.decision?.title.includes('促销');
      routeMoment = { kind:'target', label:'去机器人等候区', title:promo ? '先去安全区等优惠生效' : '其他可取商品已处理，补货还没完成',
        text:promo ? '比较过优惠和等待成本，余下时间也足够。' : '去机器人等候区，让出货架通道。补货完成且通道清空后再返架。' };
    } else if (yielded && target) {
      routeMoment = { kind:'detour', label:'先停让', title:'仍去' + target.label,
        text:'前方人员距离过近，暂时停车。连续两次观测安全后再走。', targetKey };
    } else if (checkoutTurn) {
      routeMoment = { kind:'ready', label:'到号结账', title:'轮到机器人使用收银台', text:checkoutTurn.text };
    } else if (joinedCheckout) {
      routeMoment = { kind:'target', label:'加入队列', title:'机器人和顾客共用一台收银机', text:joinedCheckout.text };
    } else if (movedTarget && view.phaseCode === 'ENTER') {
      routeMoment = { kind:'ready', label:'驶入门店', title:view.entryStart ? '从入口进店' : '从入口旁的停靠位出发',
        text:view.entryStart ? '从门外驶过入口，到入口点再开始推荐和选货。' : '从门内停靠位驶到入口点，再开始推荐和选货。' };
    } else if (movedTarget && sku) {
      const selected = view.decision?.candidates?.find(item => item.sku === sku);
      const eligible = view.decision?.candidates?.filter(item => item.eligible) || [];
      const time = Number.isFinite(selected?.delta) ? '预计新增 ' + Math.round(selected.delta) + ' 秒。' : '';
      let why = '在可取商品中选择下一站。';
      if (eligible.length === 1) why = '这是当前唯一可取且能满足整单约束的商品。';
      else if (selected?.priority === 0 && eligible.some(item => item.priority !== 0)) {
        why = view.mode === 'cart' ? '缺货风险达到 0.70，优先取货。' : '可用库存不超过 3 件，优先取货。';
      } else if (eligible.length > 1) why = '同一优先级下，这一站的新增耗时最少。';
      routeMoment = { kind:'target', label:'选下一站', title:'先去' + target.label, text:why + time + pathNote };
    } else if (movedTarget && target.label === '排队入口') {
      routeMoment = { kind:'ready', label:'去结账队尾', title:'待取任务已处理完', text:'先沿地面指示进入队尾，到号后才走到收银台。' };
    } else if (movedTarget && view.paid) {
      routeMoment = { kind:'ready', label:'去出口', title:'付款已确认', text:'走到出口，等闸机放行并实际跨门后，才记录离店。' };
    }

    explainedLogCount = logs.length;
    previousRouteView = { targetKey, route:view.route, stock:view.stock };
    const current = routeMoment || { kind:'ready', label:'路线提示', title:'看看机器人为什么这么走',
      text:'下单后，这里会显示什么时候换了目标，什么时候只是换了一条路。' };
    for (const [element,value] of [[$['route-kind'],current.label],[$['route-headline'],current.title],[$['route-detail'],current.text]]) {
      if (element.textContent !== value) element.textContent = value;
    }
    $['route-explanation'].dataset.kind = current.kind;
    const priorRoute = current.targetKey === targetKey && current.priorRoute?.length > 1 ? current.priorRoute : null;
    $['prior-route-legend'].hidden = !priorRoute;
    return { priorRoute, routeReason:{ previousTarget:current.previousTarget, blocked:priorRoute ? current.blocked : null } };
  }

  function renderProductCue(view) {
    const sku = currentSku(view);
    for (const item of orderOfProducts) {
      const count = Number(view.basket?.[item] || 0);
      const difference = count - (previousBasket[item] || 0);
      if (difference > 0) pickupBadge = { sku:item, qty:difference, timeMs:view.timeMs };
      previousBasket[item] = count;
      rows[item].row.classList.toggle('is-current', sku === item && view.active);
    }
    const justPicked = pickupBadge && view.timeMs - pickupBadge.timeMs <= 20_000 && view.active && view.phaseCode !== 'RETURN';
    const shownSku = view.phaseCode === 'PICK' && sku ? sku : justPicked ? pickupBadge.sku : view.active ? sku : null;
    const label = view.phaseCode === 'PICK' && sku ? '正在核验取货' : justPicked ? '已取到购物篮' : '当前取货目标';
    const qty = label === '已取到购物篮' ? pickupBadge.qty : null;
    const key = [shownSku,label,qty].join('|');
    if (key === shownProductKey) return;
    shownProductKey = key;
    $['map-product'].hidden = !shownSku;
    if (!shownSku) return;
    const icon = rows[shownSku].row.firstElementChild.cloneNode(true);
    $['map-product-icon'].replaceChildren(icon);
    $['map-product-state'].textContent = label;
    $['map-product-name'].textContent = shortNames[shownSku] + (qty ? ' ×' + qty + ' ' + units[shownSku] : '');
  }

  function checkoutCalled(view) {
    const queue = view.checkoutQueue;
    return view.phaseCode === 'CHECKOUT' && queue && !queue.robotQueued && queue.customersAhead === 0;
  }

  function robotDecision(view) {
    const target = view.target;
    const sku = currentSku(view);
    const item = shortNames[sku];
    const phase = view.phaseCode;
    const queue = view.checkoutQueue;
    const pending = view.pending?.kind;
    if (phase === 'IDLE') return ['等待下单', view.entryStart ? '机器人在入口外待命，提交下一单后才会出现在地图上。' : '机器人在店内停靠位待命。'];
    if (phase === 'STAFF_PENDING') return ['订单待人工处理', view.status || '已保留当前购物篮和付款记录。'];
    if (phase === 'RETURN') {
      const detail = /先让行/.test(view.status) ? '前面有人，等通道让开再走。' : '店员已离店，机器人沿店内通道回停靠位。';
      return ['返回停靠位', detail];
    }
    if (phase === 'DONE') {
      if (view.docked) return ['已停靠', '订单已处理，回到入口旁。'];
      if (view.orderExit?.actor === '店员') return ['安全停车', '店员已结账离店，机器人因返航受阻停在店内。'];
      return ['已离店', '已通过出口，可以查看订单或重新下单。'];
    }
    if (pending === 'recommend') return ['询问是否加面包', '模拟购物篮里，买牛奶的人常一起买面包。'];
    if (pending === 'delete') return ['请顾客确认删减', '等货或继续取货会超时。'];
    if (pending === 'reprice' || pending === 'quote') return ['请顾客确认价格', '新报价需要顾客同意。'];
    if (pending === 'assist' || phase === 'ASSIST') return ['停车等店员', view.status || '订单需要人工处理。'];
    if (view.handoff) return ['已交给店员', '机器人停稳，由店员继续处理原单。'];
    if (phase === 'ENTER') return [view.entryStart ? '从入口进店' : '前往入口点', '清单已通过预算和载重检查。'];
    if (phase === 'YIELD') return ['先停车让行', '距离太近，等安全后继续或绕路。'];
    if (phase === 'PICK' && item) return ['核验并取' + item, '先核对数量，确认取到才入篮。'];
    if (phase === 'WAIT' || target?.label === '等候区') {
      const promo = phase === 'WAIT' ? /促销|优惠/.test(view.status) : /促销|优惠/.test(view.decision?.title);
      return promo ? ['去安全区等促销', '水果每盒省 ¥6，且来得及离店。']
        : ['去等候区等补货', '收到补货回执后才回货架。'];
    }
    if (phase === 'PAID') return ['核价付款', '按实际拿到的商品和有效价格结算。'];
    if (phase === 'EXIT' || view.paid) return ['从出口离店', '付款已确认，等通道安全再过闸。'];
    if (queue?.robotQueued || phase === 'CHECKOUT') {
      const ahead = queue?.customersAhead || 0;
      return checkoutCalled(view) ? ['轮到机器人结账', '队首已到号，前往同一收银位。']
        : ahead ? ['排在顾客后面', '前面还有 ' + ahead + ' 位顾客，按顺序前进。']
          : ['沿共用队列等候', '等同一收银台放行，再往前走。'];
    }
    if (target?.label?.includes('结账') || target?.label?.includes('排队')) return ['前往结账队尾', '取货已结束，从顾客身后入队。'];
    if (phase === 'MOVE' && item) {
      const selected = view.decision?.candidates?.find(candidate => candidate.sku === sku);
      const eligible = (view.decision?.candidates || []).filter(candidate => candidate.eligible);
      let detail = '沿 A* 算出的通道走，到架再核验。';
      if (routeMoment?.kind === 'detour' && routeMoment.targetKey === target.x + ',' + target.y) {
        detail = '原通道受阻，A* 换条路，取货目标保留。';
      } else if (routeMoment?.kind === 'restock') {
        detail = '补货已确认，回货架检查实物。';
      } else if (routeMoment?.label === '换目标') {
        detail = '另一件商品暂时缺货，先取能拿到的。';
      } else if (eligible.length === 1) {
        detail = '这是当前唯一可取且符合整单时限的货。';
      } else if (selected?.priority === 0 && eligible.some(candidate => candidate.priority !== 0)) {
        detail = Number.isFinite(selected.risk) ? 'CART 风险 ' + selected.risk.toFixed(2) + '，优先取货。' : '库存偏低，按规则优先取货。';
      } else if (selected && eligible.length > 1 && Number.isFinite(selected.delta)) {
        detail = '同档新增用时最少，约 ' + Math.round(selected.delta) + ' 秒。';
      }
      return ['去' + item + '货架', detail];
    }
    return ['重新选下一站', '比较可取库存和剩余时间，再规划路线。'];
  }

  function nextDecision(view) {
    const { phaseCode:phase, pending, target, handoff, checkoutQueue:queue } = view;
    const confirmation = {
      recommend:'同意后把面包加入清单，到货架核验后才入篮。拒绝就按原清单继续。',
      delete:'同意才关闭未取到的数量，再规划余下清单。拒绝则交由人工处理。',
      reprice:'顾客接受新报价且仍在时限内，才继续付款。',
      quote:'顾客接受新报价且仍在时限内，才继续付款。',
      assist:'收到派店员的确认后，店员到场接过购物篮，再处理原订单。'
    }[pending?.kind];
    if (confirmation) return confirmation;
    if (phase === 'DONE') return '行程已结束，可从右上角查看订单和实付金额。';
    if (phase === 'STAFF_PENDING') return '后续由人工核对购物篮和付款记录。';
    if (phase === 'RETURN') return '先看回程通道能否安全通过，驶入入口旁停靠位后结束。';
    if (phase === 'YIELD') return handoff ? '店员查看前方间距，安全才继续。仍有阻挡时尝试换路。'
      : '连续两次确认安全才继续。若持续堵塞，尝试绕行。';
    if (phase === 'HANDOFF' && handoff !== 'shopping') return '先等店员到达机器人旁并完成交接，再继续原清单。';
    if (phase === 'WAIT' || (phase === 'MOVE' && target?.label === '等候区')) {
      const reason = phase === 'WAIT' ? view.status : view.decision?.title;
      return /促销|优惠/.test(reason || '')
        ? '核对 18:00 折扣是否生效，以及余下时间够不够结账离店。'
        : '补货完成且通道清空才返架。若等到上限，询问是否删减。';
    }
    if (phase === 'PICK') return '取货成功并收到库存回执后，更新购物篮，再检查是否还有商品没取。';
    if (phase === 'PAID') return '收到付款成功回执后，才规划去出口。';
    if (phase === 'EXIT' || view.paid) return '等闸机放行并确认通道安全，实际跨门后才记录离店。';
    if (phase === 'CHECKOUT') {
      if (queue?.staffAway) return '先等店员补货回来，再按入队顺序叫号。';
      return checkoutCalled(view)
        ? '到收银台核对实际商品、价格和时限，条件满足才发起付款。'
        : '先等前面的顾客和收银台。轮到本单后，才去柜台核价。';
    }
    if (phase === 'MOVE' && /排队|结账/.test(target?.label || '')) return '到达队尾后按到达顺序入队，查看前面有几位顾客。';
    if (phase === 'MOVE' && currentSku(view)) return '到货架检查实物数量与载重。库存不足就登记缺货，再重排任务。';
    if (phase === 'ENTER') return '到入口后查看清单，判断是否先询问加购。';
    if (phase === 'IDLE') return '收到清单后，先核对载重、预算和最晚离店时间。';
    return '先检查剩余商品能否在时限内买到，再比较缺货风险和多花的时间。';
  }

  function renderRobotRail(view, [action,reason]) {
    const copy = {
      'rail-action':action,
      'rail-reason':reason,
      'rail-next':nextDecision(view),
      'live-reason':view.status || view.decision?.text || ''
    };
    for (const [id,value] of Object.entries(copy)) {
      if ($[id].textContent !== value) $[id].textContent = value;
    }
  }

  function renderRobotBubble(view, [action,reason]) {
    const element = $['robot-bubble'];
    const recommendation = $['recommend-prompt'];
    const anchor = art.getRobotAnchor?.();
    const onMap = anchor && anchor.x >= 0 && anchor.x <= 1 && anchor.y >= 0 && anchor.y <= 1;
    const placement = !onMap ? 'fallback'
      : anchor.y < .24 ? (anchor.x < .5 ? 'side-right' : 'side-left') : 'above';
    const showRecommendation = view.pending?.kind === 'recommend' && !phone.open && !rules.open;
    recommendation.hidden = !showRecommendation;
    if (showRecommendation) positionBubble(recommendation, anchor, placement);
    element.hidden = showRecommendation || view.phaseCode === 'IDLE' || view.robotVisible === false || !onMap;
    if (element.hidden) return;
    positionBubble(element, anchor, placement);
    if ($['robot-bubble-action'].textContent !== action) $['robot-bubble-action'].textContent = action;
    if ($['robot-bubble-reason'].textContent !== reason) $['robot-bubble-reason'].textContent = reason;
  }

  function positionBubble(element, anchor, placement) {
    if (element.dataset.placement !== placement) element.dataset.placement = placement;
    if (placement === 'fallback') return;
    element.style.setProperty('--robot-x', (anchor.x * 100).toFixed(2) + '%');
    element.style.setProperty('--robot-y', (anchor.y * 100).toFixed(2) + '%');
  }

  function renderTrace(view) {
    const stage = {
      IDLE:'order', MINE:'order', WAIT_CONFIRM:'target', PLAN:'target', WAIT:'target',
      ENTER:'route', MOVE:'route', YIELD:'route', PICK:'execute', CHECKOUT:'execute', PAID:'execute',
      EXIT:'execute', RETURN:'execute', ASSIST:'execute', HANDOFF:'execute', STAFF_PENDING:'execute', DONE:'execute'
    }[view.phaseCode];
    for (const step of ['order','target','route','execute']) {
      const element = $['stage-' + step];
      if (step === stage) element.setAttribute('aria-current','step');
      else element.removeAttribute('aria-current');
    }

    const sku = currentSku(view);
    const last = view.logs?.at(-1);
    const candidate = view.decision?.candidates?.find(item => item.sku === sku)
      || view.decision?.candidates?.find(item => item.eligible);
    let input = last?.title || '等待购物清单';
    let rule = '载重上限 3000 克，同时检查预算和最晚离店时间。';
    let action = view.status || '从右上角手机提交订单。';
    if (view.phaseCode === 'RETURN' || view.phaseCode === 'DONE') {
      input = (view.outcome === 'FULL' ? '商品已买齐' : '订单部分完成') + ' · 实际支付 ' + money(view.total) + '。';
      rule = view.phaseCode === 'DONE' && !view.docked && view.orderExit?.actor === '店员' ? '返航通道受阻时，机器人在店内安全停车。'
        : view.handoff ? '店员处理完订单后，机器人沿店内通道回停靠位。'
        : '实际通过出口后结束本轮。重新下单时再从入口进店。';
    } else if (view.handoff) {
      input = last?.title || '已通知店员';
      rule = view.handoff === 'shopping'
        ? (view.paid ? '已有付款回执，店员直接通过出口。' : '沿用原清单、购物篮和预算。需要删减或接受新报价时，仍由顾客确认。')
        : '店员沿通道走到机器人旁，再接过购物篮。';
    } else if (view.phaseCode === 'ENTER') {
      input = view.entryStart ? '订单已受理，机器人从门外入口出发。' : '订单已受理，机器人从入口旁的停靠位出发。';
      rule = '到达入口点后，再开始购物任务。驶入时保持安全间距。';
    } else if (view.phaseCode === 'MINE') {
      input = '清单含牛奶，面包仍有库存。';
      rule = 'Apriori 从模拟购物篮统计共购关系。加购须经顾客确认。';
    } else if (view.phaseCode === 'YIELD') {
      input = '机器人附近有人或补货人员占用通道。';
      rule = '接近安全阈值时停让；连续两次确认安全后继续，持续阻塞时重算路线。';
    } else if (view.phaseCode === 'WAIT' || view.phaseCode === 'WAIT_CONFIRM') {
      const promoWait = /促销|优惠/.test(view.status || '') && view.phaseCode === 'WAIT';
      input = promoWait ? '水果在 18:00 生效八折。' : (last?.title || '等待现场信息或顾客回复。');
      rule = promoWait ? '比较同一篮商品的优惠、等待成本和离店时限。'
        : '收到有效回执才返架；删减须在截止前获得顾客同意。';
    } else if (view.phaseCode === 'PICK') {
      input = sku ? shortNames[sku] + '货架现场核验。' : '到达目标货架。';
      rule = '核对数量和载重，实物取到且库存回执成功后才加篮。';
    } else if (view.phaseCode === 'CHECKOUT' && view.checkoutQueue?.robotQueued) {
      const ahead = view.checkoutQueue.customersAhead;
      input = view.staff?.role === 'restock' ? '店员正在补货，收银台暂未叫号。'
        : ahead ? '机器人前面还有 ' + ahead + ' 位顾客。' : '机器人正在等待收银台叫号。';
      rule = '店员回到收银台后，顾客和机器人按入队顺序结账。等待计入预计离店时间。';
    } else if (['CHECKOUT','PAID','EXIT','DONE'].includes(view.phaseCode)) {
      input = '实际篮重 ' + view.mass + ' 克，' + (view.paid ? '已付款 ' : '当前金额 ') + money(view.total) + '。';
      rule = '按结账时的有效价格核对；付款成功后，还要等闸机放行和实际出门。';
    } else if (view.phaseCode === 'MOVE' || view.phaseCode === 'PLAN') {
      if (candidate && sku) {
        input = shortNames[sku] + ' · 已知库存 ' + candidate.stock + ' 件'
          + (candidate.risk == null ? '' : ' · 风险分 ' + Number(candidate.risk).toFixed(2));
        rule = view.mode === 'cart' ? '先检查整单可行，CART 分数达到 0.70 优先，同档比新增时间。'
          : '先检查整单可行，库存不超过 3 件优先，同档比新增时间。';
      } else if (view.target) {
        input = view.target.label;
        rule = '当前目标确定后，用 A* 在可通行网格中找路。';
      }
    } else if (view.phaseCode === 'ASSIST') {
      rule = '机器人停车并保留购物篮。派店员后，店员到场接篮并继续处理订单。';
    }
    $['trace-input'].textContent = input;
    $['trace-rule'].textContent = rule;
    $['trace-action'].textContent = action;
  }

  function renderDecision(view) {
    renderTrace(view);
    const decision = view.decision;
    $['explanation'].textContent = view.handoff || view.phaseCode === 'RETURN' || view.phaseCode === 'DONE' ? view.status
      : decision ? [decision.title, decision.text].filter(Boolean).join(' · ')
        : '下单后，这里会显示缺货风险、取货优先级，以及机器人选择当前目标的原因。';
    $['candidate-list'].replaceChildren(...candidateRows(decision, currentSku(view)));
  }

  function candidateRows(decision, activeSku) {
    return (decision?.candidates || []).map(candidate => {
      const label = shortNames[candidate.sku] || candidate.name || candidate.sku;
      const sourceKey = String(candidate.source || '').toUpperCase();
      const risk = candidate.risk == null
        ? (sourceKey === 'FALLBACK' ? '未计算风险分' : '风险未知')
        : '风险 ' + Number(candidate.risk).toFixed(3);
      const priority = candidate.eligible === false ? '当前不可取' : candidate.priority === 0 ? '优先' : '普通';
      const delta = Number.isFinite(candidate.delta) ? ' · 增时 ' + Math.round(candidate.delta) + ' 秒' : '';
      const source = { MODEL:'CART', CASE:'案例', FALLBACK:'库存规则', OBSERVED:'现场库存' }[sourceKey];
      const selected = candidate.sku === activeSku || candidate.sku === decision.selectedSku || candidate.chosen;
      const row = node('div', undefined, 'candidate' + (selected ? ' is-target' : ''));
      row.append(node('b', label), node('span', [source, risk, priority].filter(Boolean).join(' · ') + delta));
      const branch = candidate.rule || candidate.riskPath;
      if (branch) {
        const rules = node('details', undefined, 'tree-rule');
        rules.append(node('summary','查看分支'), node('p', branch));
        row.append(rules);
      }
      return row;
    });
  }

  function logRow(log) {
    const line = node('li');
    const copy = node('div');
    copy.append(node('b', log.title || log.kind || '状态更新'), node('small', log.text || ''));
    line.append(node('time', clock(log.timeMs)), copy);
    return line;
  }

  function renderW12Model() {
    const model = engineApi.modelInfo;
    const threshold = Number.isFinite(model?.threshold) ? ' · 阈值 ' + model.threshold.toFixed(2) : '';
    $['w12-model'].textContent = (model?.version || engineApi.modelVersion || '待核验') + threshold;
    const hashParts = model?.sha256?.match(/.{1,8}/g) || ['待核验'];
    $['w12-model-sha'].replaceChildren(...hashParts.flatMap((part, index) => index ? [node('wbr'), part] : [part]));
    $['w12-model-features'].textContent = Array.isArray(model?.features) ? model.features.join('、') : '待核验';
    $['w12-model-label'].textContent = model?.label || '待核验';
  }

  function runW12(mode) {
    const simulation = engineApi.create({ scenario:'normal', mode, seed:6143, quiet:true, entryStart:false });
    const submission = simulation.submit({ items:{ EGG:1, MILK:1 }, budget:80, leaveBy:'18:10', allowSubstitution:false });
    if (!submission.ok) throw new Error(submission.error || '固定订单未能受理。');
    let view = simulation.getView();
    let declined = false;
    for (let step = 0; view.active && step < 12000; step++) {
      simulation.tick(100);
      view = simulation.getView();
      if (view.pending?.kind === 'recommend') {
        declined = simulation.answer(false) || declined;
        view = simulation.getView();
      } else if (view.pending) {
        break;
      }
    }
    return { view, declined, firstPlan:view.decisionHistory.find(decision => decision.selectedSku) };
  }

  function renderW12() {
    const status = $['w12-status'];
    const results = $['w12-results'];
    results.replaceChildren();
    try {
      const runs = ['cart', 'fallback'].map(runW12);
      const cards = runs.map(({ view, declined, firstPlan }) => {
        const card = node('div');
        const mode = view.mode === 'cart' ? 'CART 决策树' : '库存规则';
        const chosen = firstPlan ? '首站 ' + shortNames[firstPlan.selectedSku] : '尚未选站';
        const top = node('dt', mode + ' · ' + chosen);
        const rows = node('dd', undefined, 'candidates');
        rows.append(...candidateRows(firstPlan));
        const start = view.logs.find(log => log.kind === 'order')?.timeMs ?? 0;
        const end = view.orderExit?.timeMs ?? view.timeMs;
        const duration = ((end - start) / 1000).toFixed(1) + ' 秒';
        const outcome = { FULL:'全部完成', PARTIAL:'部分完成', HANDOFF:'转人工' }[view.outcome] || '未完成';
        const total = view.paid ? '实付 ' + money(view.total) : '未付款';
        const summary = node('dd', outcome + ' · ' + duration + ' · ' + total);
        card.append(top, rows, summary);
        if (!view.orderExit) card.append(node('dd', view.status));
        if (!declined) card.append(node('dd', '本次未出现加购请求。'));
        return card;
      });
      results.replaceChildren(...cards);
      status.textContent = runs.every(run => run.view.orderExit) ? '两次均已完成并确认离店。' : '存在未完成的运行，请查看记录。';
    } catch (error) {
      status.textContent = '无法运行复验。' + error.message;
    }
  }

  function renderResult(view) {
    const full = view.outcome === 'FULL';
    resultDialog.dataset.outcome = full ? 'full' : 'partial';
    $['result-title'].textContent = full ? '购物完成！' : '订单部分完成';
    const missed = orderOfProducts.filter(sku => (view.originalItems[sku] || 0) > (view.basket[sku] || 0));
    const missingText = !full && missed.length ? ' · 未买齐 ' + missed.map(sku => shortNames[sku]).join('、') : '';
    $['result-note'].textContent = view.orderExit.actor + '已结账离店' + missingText;
    $['result-total'].textContent = money(view.total);
    const start = view.logs.find(log => log.kind === 'order')?.timeMs ?? view.orderExit.timeMs;
    const seconds = Math.max(0, Math.round((view.orderExit.timeMs - start) / 1000));
    $['result-duration'].textContent = (seconds >= 60 ? Math.floor(seconds / 60) + ' 分 ' : '') + seconds % 60 + ' 秒';
    $['result-mode'].textContent = view.mode === 'fallback' ? '库存规则' : 'CART 决策树';
    const items = orderOfProducts.filter(sku => view.basket[sku] > 0).map(sku => {
      const row = node('li');
      row.append(node('b', shortNames[sku]), node('span', view.basket[sku] + ' ' + units[sku]));
      return row;
    });
    $['result-items'].replaceChildren(...items);
    const decisions = (view.decisionHistory || []).map(decision => {
      const row = logRow(decision);
      const candidates = candidateRows(decision);
      if (candidates.length) {
        const details = node('details', undefined, 'result-candidates');
        const grid = node('div', undefined, 'candidates');
        grid.append(...candidates);
        details.append(node('summary','查看当时的候选商品'), grid);
        row.children[1].append(details);
      }
      return row;
    });
    $['result-decisions'].replaceChildren(...(decisions.length ? decisions : [node('li', '本单的判断过程见下方运行记录。')]));
    $['result-log'].replaceChildren(...view.logs.map(logRow));
    $['result-log-count'].textContent = view.logs.length + ' 条';
  }

  function openResult(celebrate = false) {
    if (!resultShown || resultDialog.open) return;
    closePhone();
    if (rules.open) rules.close();
    const confetti = $['result-confetti'];
    confetti.hidden = !celebrate;
    confetti.replaceChildren();
    if (celebrate) {
      const tones = ['#f38d9e', '#f9ca78', '#f3ee98', '#91dbb7', '#86c8ef', '#baa6f2'];
      const particles = Array.from({ length:36 }, (_, index) => {
        const piece = node('i');
        const angle = index * 2.4;
        const radius = 78 + (index * 43) % 190;
        piece.style.setProperty('--dx', Math.round(Math.cos(angle) * radius) + 'px');
        piece.style.setProperty('--dy', Math.round(Math.sin(angle) * radius * .55) + 'px');
        piece.style.setProperty('--spin', (index % 2 ? -1 : 1) * (150 + index * 29) + 'deg');
        piece.style.setProperty('--tone', tones[index % tones.length]);
        piece.style.setProperty('--delay', (index % 6) * 22 + 'ms');
        return piece;
      });
      confetti.replaceChildren(...particles);
    }
    resultDialog.showModal();
    $['result-body'].scrollTop = 0;
  }

  function maybeShowResult(view) {
    if (resultShown || !canReorder(view) || !view.paid || !view.orderExit) return;
    renderResult(view);
    resultShown = true;
    $['phone-result'].hidden = false;
    openResult(view.outcome === 'FULL');
  }

  function renderLogs(logs) {
    if (logs.length === renderedLogCount) return;
    const list = $['event-list'];
    const freshList = renderedLogCount < 1 || logs.length < renderedLogCount;
    const rows = logs.slice(freshList ? 0 : renderedLogCount).reverse().map(logRow);
    if (freshList) {
      list.replaceChildren(...(rows.length ? rows : [node('li','下单后会在这里显示每一步。','log-empty')]));
      list.scrollTop = 0;
    } else {
      const offset = list.scrollTop;
      const before = offset > 0 ? list.scrollHeight : 0;
      list.prepend(...rows);
      if (offset > 0) list.scrollTop = offset + list.scrollHeight - before;
    }
    renderedLogCount = logs.length;
    $['log-count'].textContent = logs.length + ' 条';
  }

  function renderPending(view) {
    const pending = view.pending;
    phoneButton.dataset.state = pending ? 'pending' : locked ? 'ordered' : 'ready';
    $['phone-trigger-label'].textContent = pending ? '待确认' : locked ? '查看订单' : '点击下单';
    $['phone-title'].textContent = pending ? '订单确认' : canReorder(view) ? '订单回执' : locked ? '订单与购物篮' : '超市下单';
    const key = pending ? [pending.kind,pending.text,pending.expiresAt].join('|') : '';
    if (key === priorPending) return;
    priorPending = key;
    const suggestedItem = pending?.kind === 'recommend' && shortNames[pending.sku];
    if (suggestedItem) $['recommend-title'].textContent = '推荐加购' + suggestedItem;
    $['phone-notice'].textContent = suggestedItem ? '机器人建议加购' + suggestedItem + '。点击地图上的提示查看。'
      : pending ? '机器人有一项请求，打开右上角的手机查看。' : '';
    $.response.hidden = !pending;
    if (!pending) return;
    const assist = /assist|staff|handoff|人工/i.test(pending.kind || '');
    $['response-title'].textContent = assist ? '等待员工接管' : '机器人请求确认';
    $['response-text'].textContent = pending.text || '请确认下一步。';
    $.approve.textContent = assist ? '派店员接手' : '同意';
    $.decline.hidden = assist;
  }

  function countdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function renderScene(view) {
    const restock = view.restock;
    const restockState = restock?.state || 'none';
    const stockSku = (restockState === 'none' ? view.stockoutSku : restock.sku) || 'MILK';
    const quantity = view.worldStock?.[stockSku] ?? view.stock?.[stockSku];
    const stockText = {
      waiting: '等待员工补货',
      working: '员工正在补货',
      completed: '补货完成 · ' + quantity + ' 件'
    }[restockState] || (quantity === 0 ? '缺货 · 0 件' : (quantity == null ? '待核验' : '在架 · ' + quantity + ' 件'));
    const crowd = view.pedestrians?.length || 0;
    const queue = view.checkoutQueue;
    const stocking = view.staff?.role === 'restock';
    const orderActor = view.handoff ? '店员' : '机器人';
    const queueText = queue?.robotQueued && queue.customersAhead > 0 ? '订单前有 ' + queue.customersAhead + ' 人'
      : queue?.serving === 'robot' ? orderActor + (view.phaseCode === 'CHECKOUT' ? '已到号，走向柜台' : '正在结账')
      : queue?.serving === 'customer' ? '顾客结账 · ' + queue.waiting + ' 人等候'
      : stocking ? '补货期间暂停叫号'
      : queue?.robotQueued ? '订单等待叫号' : queue?.waiting > 0 ? queue.waiting + ' 人等候' : '空闲';
    const staffText = stocking ? (restock.aisleWaiting ? '在货架通道口等候' : '推车补货中')
      : view.handoff && view.phaseCode !== 'RETURN' && view.phaseCode !== 'DONE' ? (view.outcome ? (view.outcome === 'HANDOFF' ? '订单待处理' : '已送至出口')
        : ({ dispatch:'准备接手', approach:'前往机器人旁', transfer:'正在交接购物篮' }[view.handoff] || '处理接手订单'))
        : queue?.serving ? '正在收银' : '在收银台';
    const promoStart = view.promoStartsAt ?? 600000;
    const promoText = view.promoActive ? '八折 ¥24 · 原价 ¥30'
      : (view.promoEnabled && view.timeMs < promoStart ? '八折还有 ' + countdown(promoStart - view.timeMs) : '原价 ¥30');
    const priceText = (view.promoActive ? '¥24 · 八折 · ' : '¥30 · ') + products.FRUIT.weight + 'g';
    for (const [element, value] of [[$['scene-stock-label'], shortNames[stockSku] + '架'], [$['scene-stock'], stockText], [$['scene-crowd'], crowd + ' 人'], [$['scene-queue'], queueText], [$['scene-staff'],staffText], [$['scene-promo'], promoText], [rows.FRUIT.detail, priceText]]) {
      if (element.textContent !== value) element.textContent = value;
    }
    $['stock-scene'].dataset.tone = restockState === 'completed' ? 'good' : (quantity === 0 || restockState === 'working' ? 'alert' : '');
    $['crowd-scene'].dataset.tone = crowd ? 'good' : '';
    $['queue-scene'].dataset.tone = queue?.robotQueued && queue.customersAhead ? 'alert' : (queue?.serving ? 'good' : '');
    $['staff-scene'].dataset.tone = stocking ? 'alert' : 'good';
    $['promo-scene'].dataset.tone = view.promoActive ? 'alert' : '';
  }

  function renderShoppers(view) {
    const people = view.pedestrians || [];
    const signature = JSON.stringify(people.map(({id,stage,item,motion,aisleWaiting}) => [id,stage,item,motion,aisleWaiting]));
    if (signature === shopperSignature) return;
    shopperSignature = signature;
    const labels = { enter:'进门', browse:'前往货架', pick:'选货', approachQueue:'前往收银台', queue:'排队等候', pay:'扫码结账', exit:'前往出口' };
    const list = people.map((person,index) => {
      const identifier = String(person.id ?? index + 1).match(/\d+$/)?.[0] || String(index + 1);
      const item = shortNames[person.item];
      const action = person.aisleWaiting ? '在通道口等前面的人离开'
        : person.motion === 'waiting' ? '停下等通道让开'
        : person.motion === 'detour' ? '绕开拥堵' : labels[person.stage] || '店内走动';
      const detail = item && ['browse','pick'].includes(person.stage) ? action + ' · ' + item : action;
      const li = node('li');
      li.append(node('b','顾客 ' + identifier.padStart(2,'0')),node('span',detail));
      return li;
    });
    $['shopper-list'].replaceChildren(...(list.length ? list : [node('li','当前暂无顾客','empty')]));
  }

  function draw(now, force = false) {
    const view = engine.getView();
    const routeExplanation = describeRoute(view);
    art.draw({ ...view, ...routeExplanation, showGrid:grid, showLabels, zoom }, now);
    renderScene(view);
    renderShoppers(view);
    renderProductCue(view);
    const decision = robotDecision(view);
    renderRobotRail(view, decision);
    renderRobotBubble(view, decision);
    $['step-event'].disabled = !view.active || Boolean(view.pending);
    $['quick-compare'].disabled = Boolean(view.active);
    const time = clock(view.timeMs);
    if ($.clock.textContent !== time) $.clock.textContent = time;
    const result = { FULL:'购物完成', PARTIAL:'部分完成', HANDOFF:'人工待处理' }[view.outcome];
    const status = result || (view.active ? '购物进行中' : '等待下单');
    const detail = view.active ? [view.phase, view.target?.label].filter(Boolean).join(' · ') : '';
    if ($.phase.textContent !== status) $.phase.textContent = status;
    if ($['map-destination'].textContent !== detail) $['map-destination'].textContent = detail;
    const lastLog = view.logs?.at(-1);
    const signature = JSON.stringify([view.phaseCode, view.status, view.active, view.docked, view.outcome, view.paid, view.total, view.basket, view.pending, view.decision, view.checkoutQueue, view.staff?.role, view.handoff,
      view.target?.label, view.logs?.length, lastLog?.title]);
    if (force || signature !== priorSignature) {
      priorSignature = signature;
      renderBasket(view);
      renderDecision(view);
      renderPending(view);
      renderLogs(view.logs);
      maybeShowResult(view);
    }
  }

  function frame(now) {
    if (priorFrame === undefined) priorFrame = now;
    const elapsed = Math.min(100, now - priorFrame);
    priorFrame = now;
    const view = engine.getView();
    if (!view.active) {
      if (view.scenario !== 'compare') engine.tickIdle(elapsed);
    } else if (locked && !paused) {
      carry += elapsed * (view.pending ? 1 : Number($.speed.value));
      const sim = Math.floor(carry / 100) * 100;
      if (sim) {
        engine.tick(sim);
        carry -= sim;
      }
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  function wireDialog(dialog, trigger, closeButton) {
    closeButton.addEventListener('click', () => dialog.close());
    if (trigger) dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded','false'));
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const { left, right, top, bottom } = dialog.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
    });
  }

  phoneButton.addEventListener('click', openPhone);
  $['recommend-prompt'].addEventListener('click', openPhone);
  wireDialog(phone, phoneButton, $['phone-close']);
  wireDialog(resultDialog, null, $['result-close']);
  resultDialog.addEventListener('close', () => {
    $['result-confetti'].hidden = true;
    if (!phone.open && !rules.open) phoneButton.focus({ preventScroll:true });
  });
  $['result-back'].addEventListener('click', () => resultDialog.close());
  $['phone-result'].addEventListener('click', () => openResult());
  wireDialog(rules, rulesButton, $['rules-close']);
  rulesButton.addEventListener('click', () => {
    if (rules.open) return;
    rules.showModal();
    rulesButton.setAttribute('aria-expanded','true');
  });
  function reorder() {
    if (!canReorder(engine.getView())) return;
    startAtEntrance = true;
    reset();
    openPhone();
    $['phone-body'].scrollTop = 0;
    $.scenario.focus({ preventScroll:true });
  }
  $['phone-reorder'].addEventListener('click', reorder);
  $['result-reorder'].addEventListener('click', reorder);
  const railTabs = {
    decision:$['rail-show-decision'], logs:$['rail-show-logs'], shoppers:$['rail-show-shoppers']
  };
  for (const [pane, button] of Object.entries(railTabs)) {
    button.addEventListener('click', () => {
      $['side-rail'].dataset.pane = pane;
      for (const [name, tab] of Object.entries(railTabs)) tab.setAttribute('aria-pressed', name === pane);
    });
  }
  $.submit.addEventListener('click', launch);
  $.reset.addEventListener('click', () => {
    startAtEntrance = false;
    reset();
  });
  function setScenarioCart() {
    const emptyCart = { EGG:0, MILK:0, BREAD:0, FRUIT:0 };
    if (isStockoutScenario()) {
      const sku = $['stockout-sku'].value;
      const companion = sku === 'EGG' ? 'BREAD' : 'EGG';
      cart = { ...emptyCart, [sku]:1, [companion]:1 };
    } else {
      cart = { ...emptyCart, ...engineApi.presets[$.scenario.value].items };
    }
    reset();
  }
  $.scenario.addEventListener('change', setScenarioCart);
  $['stockout-sku'].addEventListener('change', setScenarioCart);
  $['risk-mode'].addEventListener('change', reset);
  function applyPreset(items) {
    cart = items;
    if ($.scenario.value === 'showcase') $.scenario.value = 'normal';
    reset();
  }
  $['preset-a'].addEventListener('click', () => applyPreset({EGG:1,MILK:1,BREAD:0,FRUIT:0}));
  $['preset-b'].addEventListener('click', () => applyPreset({EGG:1,MILK:0,BREAD:1,FRUIT:0}));
  $['quick-compare'].addEventListener('click', () => {
    if (engine.getView().active) return;
    if (rules.open) rules.close();
    $.scenario.value = 'compare';
    cart = {EGG:1,MILK:1,BREAD:0,FRUIT:0};
    if (locked) startAtEntrance = true;
    reset();
    openPhone();
    $['risk-mode'].focus();
  });
  $['run-w12'].addEventListener('click', renderW12);
  $['step-event'].addEventListener('click', () => {
    let view = engine.getView();
    if (!view.active || view.pending) return;
    const currentLog = view.logs.length;
    const stopAt = view.timeMs + 240_000;
    paused = true;
    carry = 0;
    $.pause.textContent = '继续';
    do {
      engine.tick(100);
      view = engine.getView();
    } while (view.active && !view.pending && view.logs.length === currentLog && view.timeMs < stopAt);
    draw(performance.now(), true);
  });
  $.pause.addEventListener('click', () => {
    paused = !paused;
    $.pause.textContent = paused ? '继续' : '暂停';
  });
  function answerRequest(accepted) {
    const dispatchStaff = accepted && engine.getView().pending?.kind === 'assist';
    const answered = engine.answer(accepted);
    if (answered && dispatchStaff) {
      paused = false;
      carry = 0;
      $.pause.textContent = '暂停';
    }
    draw(performance.now(), true);
    if (answered) closePhone();
  }
  $.approve.addEventListener('click', () => answerRequest(true));
  $.decline.addEventListener('click', () => answerRequest(false));
  $.grid.addEventListener('click', () => { grid = !grid; $.grid.setAttribute('aria-pressed', grid); });
  $['show-labels'].addEventListener('click', () => {
    showLabels = !showLabels;
    $['show-labels'].setAttribute('aria-pressed', showLabels);
  });
  $['zoom-in'].addEventListener('click', () => { zoom = Math.min(1.68, zoom + .2); });
  $['zoom-out'].addEventListener('click', () => { zoom = Math.max(1, zoom - .2); });

  renderW12Model();
  reset();
  requestAnimationFrame(frame);
})();

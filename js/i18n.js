// Korean (default) + English dictionary.
const DICT = {
  ko: {
    'title': 'Shape Legion — 도형 군단',
    'tagline': '도형 병력을 그려 배치하고, 수천 명이 자동으로 싸운다',
    'menu.demo': '데모 전투',
    'menu.preset': '전투 규모',
    'menu.settings': '설정',
    'menu.credits': '크레딧',
    'menu.lang': 'English',
    'menu.note': '1라운드 데모 — 병력 그리기·업그레이드는 다음 라운드에 추가됩니다.',
    'preset.small': '소형',
    'preset.standard': '표준',
    'preset.medium': '중형',
    'preset.large': '대형',
    'unit.0': '병사', 'unit.1': '방패수', 'unit.2': '궁수', 'unit.3': '기수', 'unit.4': '투석기',
    'team.0': '파랑', 'team.1': '빨강',
    'hud.pause': '일시정지', 'hud.play': '재생',
    'hud.restart': '같은 시드로 다시', 'hud.newseed': '새 전투',
    'hud.fit': '화면 맞춤', 'hud.overlay': 'FPS 표시', 'hud.menu': '메뉴', 'hud.settings': '설정',
    'hud.seed': '시드', 'hud.speed': '배속',
    'hud.help': '드래그: 이동 · 휠/핀치: 확대',
    'banner.win0': '파랑 군단 승리!', 'banner.win1': '빨강 군단 승리!', 'banner.draw': '무승부',
    'banner.replay': '⟲ 같은 시드', 'banner.new': '🎲 새 전투', 'banner.menu': '☰ 메뉴',
    'banner.sub': '{time}초 · 생존 {n}명 · 시드 {seed}',
    'banner.stars': '별 {n}/3',
    'set.title': '설정',
    'set.lang': '언어',
    'set.cap': '최대 유닛 수',
    'set.auto': '자동',
    'set.fx': '이펙트',
    'set.fx.0': '낮음', 'set.fx.1': '보통', 'set.fx.2': '높음',
    'set.volume': '소리 크기',
    'set.motion': '화면 흔들림',
    'set.close': '닫기',
    'set.capnote': '다음 전투부터 적용됩니다.',
    'toast.scaled': '유닛 상한({cap}) 때문에 {n} vs {n}로 줄였어요. 설정에서 올릴 수 있어요.',
    'toast.lowered': '프레임이 낮아 자동 상한을 {cap}으로 낮춥니다(다음 전투부터).',
    'toast.fxlow': '프레임이 낮아 이펙트를 줄였어요.',
    'credits.title': '크레딧',
    'credits.body': '코드: sigco3111 (MIT). 도형·이펙트는 모두 코드로 그렸으며, 외부 에셋은 아직 사용하지 않았습니다.',
    'self.title': '자체 테스트',
    'a11y.canvas': '전투 화면',
  },
  en: {
    'title': 'Shape Legion',
    'tagline': 'Paint your shape army, press Fight, and thousands battle automatically',
    'menu.demo': 'Demo Battle',
    'menu.preset': 'Battle size',
    'menu.settings': 'Settings',
    'menu.credits': 'Credits',
    'menu.lang': '한국어',
    'menu.note': 'Round 1 demo — painting formations and upgrades arrive in later rounds.',
    'preset.small': 'Small',
    'preset.standard': 'Standard',
    'preset.medium': 'Medium',
    'preset.large': 'Large',
    'unit.0': 'Soldier', 'unit.1': 'Shieldbearer', 'unit.2': 'Archer', 'unit.3': 'Rider', 'unit.4': 'Catapult',
    'team.0': 'Blue', 'team.1': 'Red',
    'hud.pause': 'Pause', 'hud.play': 'Play',
    'hud.restart': 'Replay same seed', 'hud.newseed': 'New battle',
    'hud.fit': 'Fit view', 'hud.overlay': 'Show FPS', 'hud.menu': 'Menu', 'hud.settings': 'Settings',
    'hud.seed': 'Seed', 'hud.speed': 'Speed',
    'hud.help': 'Drag: pan · Wheel/pinch: zoom',
    'banner.win0': 'Blue legion wins!', 'banner.win1': 'Red legion wins!', 'banner.draw': 'Draw',
    'banner.replay': '⟲ Same seed', 'banner.new': '🎲 New battle', 'banner.menu': '☰ Menu',
    'banner.sub': '{time}s · {n} survivors · seed {seed}',
    'banner.stars': 'Stars {n}/3',
    'set.title': 'Settings',
    'set.lang': 'Language',
    'set.cap': 'Max units',
    'set.auto': 'Auto',
    'set.fx': 'Effects',
    'set.fx.0': 'Low', 'set.fx.1': 'Medium', 'set.fx.2': 'High',
    'set.volume': 'Volume',
    'set.motion': 'Screen shake',
    'set.close': 'Close',
    'set.capnote': 'Applies from the next battle.',
    'toast.scaled': 'Unit cap ({cap}) reduced the battle to {n} vs {n}. Raise it in Settings.',
    'toast.lowered': 'Low frame rate: auto cap lowered to {cap} (next battle).',
    'toast.fxlow': 'Low frame rate: effects reduced.',
    'credits.title': 'Credits',
    'credits.body': 'Code: sigco3111 (MIT). All shapes and effects are drawn in code; no external assets are used yet.',
    'self.title': 'Self-test',
    'a11y.canvas': 'Battlefield',
  },
};

let lang = 'ko';
const listeners = [];
export function getLang() { return lang; }
export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  document.documentElement.lang = l;
  applyI18n(document);
  listeners.forEach((f) => f(l));
}
export function onLang(f) { listeners.push(f); }
export function t(key, params) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.ko[key] ?? key;
  if (params) for (const k in params) s = s.replaceAll('{' + k + '}', params[k]);
  return s;
}
export function applyI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); e.setAttribute('aria-label', e.title); });
  root.querySelectorAll('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
  document.title = t('title') + (lang === 'ko' ? '' : ' — 도형 군단');
}

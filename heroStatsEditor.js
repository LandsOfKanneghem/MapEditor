(() => {
  'use strict';
  const Rules = window.HeroProgression;
  const dialog = document.createElement('dialog');
  dialog.id = 'hero-stats-dialog';
  dialog.setAttribute('aria-labelledby', 'hero-stats-title');
  dialog.innerHTML = `
    <h2 id="hero-stats-title">Характеристики</h2>
    <div class="hero-level-row">
      <span>Уровень</span>
      <div class="hero-level-controls">
        <button type="button" data-level-delta="-1" aria-label="Уменьшить уровень">−</button>
        <output id="hero-level"></output>
        <button type="button" data-level-delta="1" aria-label="Повысить уровень">+</button>
      </div>
      <div class="hero-budget" aria-label="Осталось повышений">
        <output id="hero-budget-two"></output><output id="hero-budget-one"></output>
      </div>
    </div>
    <div class="hero-attribute-head" aria-hidden="true"><span>Атрибут</span><span>Значение</span><span>Очки +2</span><span>Очки +1</span></div>
    <div id="hero-attribute-rows"></div>
    <p class="hero-attribute-cost-note">После 16 вложенных очков каждые 2 дают +1. Неполное повышение сохраняется.</p>
    <div class="hero-stats-actions">
      <button type="button" id="save-hero-stats">Сохранить</button>
      <button type="button" id="close-hero-stats">Закрыть без сохранения</button>
    </div>`;
  document.body.append(dialog);
  const rows = dialog.querySelector('#hero-attribute-rows');
  const statRows = new Map();
  let hero = null, draft = null, previousFocus = null;
  for (const stat of Rules.ATTRIBUTES) {
    const row = document.createElement('div');
    row.className = 'hero-attribute-row';
    row.dataset.stat = stat;
    const label = document.createElement('span');
    label.textContent = stat.toUpperCase();
    const value = document.createElement('output');
    value.className = 'hero-attribute-value';
    value.setAttribute('aria-label', `Значение ${stat.toUpperCase()}`);
    const summary = document.createElement('div');
    summary.className = 'hero-attribute-summary';
    const rate = document.createElement('span');
    rate.className = 'hero-attribute-rate';
    summary.append(value, rate);
    row.append(label, summary);
    for (const amount of [2, 1]) {
      const group = document.createElement('div');
      group.className = 'hero-allocation-controls';
      const count = document.createElement('output');
      count.dataset.amount = amount;
      count.setAttribute('aria-label', `Доступно повышений ${stat.toUpperCase()} на ${amount}`);
      for (const delta of [-1, 1]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = delta < 0 ? '−' : '+';
        button.dataset.amount = amount;
        button.dataset.delta = delta;
        button.setAttribute('aria-label', `${delta < 0 ? 'Вернуть' : 'Вложить'} ${amount} ${amount === 1 ? 'очко' : 'очка'} ${delta < 0 ? 'из' : 'в'} ${stat.toUpperCase()}`);
        button.addEventListener('click', () => { Rules.allocate(draft, stat, amount, delta, hero.skills ?? []); render(); });
        if (delta > 0) group.append(count);
        group.append(button);
      }
      row.append(group);
    }
    rows.append(row);
    statRows.set(stat, row);
  }
  function render() {
    const total = Rules.remaining(draft, undefined, hero.skills ?? []);
    dialog.querySelector('#hero-level').value = draft.level;
    dialog.querySelector('#hero-budget-two').value = `2×${total.two}`;
    dialog.querySelector('#hero-budget-one').value = `1×${total.one}`;
    dialog.querySelector('[data-level-delta="-1"]').disabled = draft.level === Rules.MIN_LEVEL;
    dialog.querySelector('[data-level-delta="1"]').disabled = draft.level === Rules.MAX_LEVEL;
    for (const [stat, row] of statRows) {
      const available = Rules.remaining(draft, stat, hero.skills ?? []);
      const investment = Rules.investment(draft, stat);
      row.querySelector('.hero-attribute-value').value = investment.value + investment.pending / 2;
      row.querySelector('.hero-attribute-rate').textContent = ` (${investment.costPerPoint}:1)`;
      row.querySelector('.hero-attribute-summary').title = `Вложено очков: ${investment.spent}. Для следующего +1 нужно ещё ${investment.nextCost}.`;
      for (const amount of [2, 1]) {
        const key = amount === 2 ? 'two' : 'one';
        row.querySelector(`output[data-amount="${amount}"]`).value = `${amount}×${available[key]}`;
        row.querySelector(`button[data-amount="${amount}"][data-delta="1"]`).disabled = available[key] === 0;
        row.querySelector(`button[data-amount="${amount}"][data-delta="-1"]`).disabled = draft.allocations[stat][key]
          + Object.values(draft.bonuses ?? {}).reduce((sum, allocations) => sum + allocations[stat][key], 0) === 0;
      }
    }
  }
  for (const button of dialog.querySelectorAll('[data-level-delta]')) {
    button.addEventListener('click', () => { Rules.changeLevel(draft, Number(button.dataset.levelDelta)); render(); });
  }
  dialog.querySelector('#save-hero-stats').addEventListener('click', () => {
    const skills = window.HeroSkills.reconcile(hero.skills ?? [], draft.level);
    hero.progression = Rules.normalize(draft, skills);
    if (hero.skills !== undefined) hero.skills = skills;
    window.EquipmentModel.reconcileSkills(hero);
    dialog.close();
  });
  dialog.querySelector('#close-hero-stats').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { hero = null; draft = null; previousFocus?.focus(); });
  window.HeroStatsEditor = Object.freeze({
    open(mob, name) {
      if (!window.MapEquipment.HEROES.includes(mob.type) || mob.team !== 'ally') return;
      hero = mob;
      draft = mob.progression === undefined ? Rules.create() : Rules.read(mob).progression;
      previousFocus = document.activeElement;
      dialog.querySelector('#hero-stats-title').textContent = `Характеристики — ${name}`;
      render();
      if (!dialog.open) dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
    isOpen: () => dialog.open
  });
})();

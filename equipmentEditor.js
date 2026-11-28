(() => {
  'use strict';
  const { items } = window.EquipmentCatalog;
  const Model = window.EquipmentModel;
  const order = ['gloves', 'head', 'boots', 'rightHand', 'chest', 'leftHand', 'belt', 'other1', 'other2'];
  const names = { head: 'Голова', boots: 'Обувь', gloves: 'Перчатки', belt: 'Пояс', chest: 'Нагрудник',
    rightHand: 'Правая рука', leftHand: 'Левая рука', other1: 'Прочее 1', other2: 'Прочее 2', consumables: 'Расходник' };
  const allowed = { head: 'шлем, шляпа', boots: 'ботинки, сапоги', gloves: 'перчатки', belt: 'пояс',
    chest: 'нагрудная броня, кольчуга, мантия', rightHand: 'одноручное оружие, двуручное оружие',
    leftHand: 'щит, двуручное оружие', other1: 'кольцо, амулет, плащ', other2: 'кольцо, амулет, плащ',
    consumables: 'зелье, противоядие, бинты, гремучая смесь' };
  const outlines = { head: 'head', boots: 'boots', gloves: 'gloves', belt: 'belt', chest: 'chest',
    rightHand: 'sword', leftHand: 'shield', other1: 'ring', other2: 'ring' };
  const modifiers = { maxHP: 'ОЗ', maxWP: 'WP', mp: 'ОП', maxMP: 'ОП', maxAP: 'ОД', consumableSlots: 'Слот расходников',
    vit: 'VIT', str: 'STR', att: 'ATT', int: 'INT', wis: 'WIS', cha: 'CHA', luc: 'LUC', eva: 'Уклонение (%)',
    physical: 'Физическая защита', fire: 'Защита от огня', water: 'Защита от воды', earth: 'Защита от земли',
    air: 'Защита от воздуха', poison: 'Защита от яда', mind: 'Защита разума', dark: 'Защита от тьмы',
    light: 'Защита от света', cri: 'Крит (%)', blo: 'Блок (%)' };
  const damageNames = { physical: 'физический', poison: 'яд', fire: 'огонь', water: 'вода',
    earth: 'земля', air: 'воздух', light: 'свет', dark: 'тьма' };
  const dialog = document.createElement('dialog');
  dialog.id = 'hero-equipment-dialog';
  dialog.setAttribute('aria-label', 'Экипировка героя');
  dialog.innerHTML = `
    <div class="equipment-editor-toolbar">
      <select id="equipment-filter" aria-label="Тип предметов"></select>
      <div class="equipment-editor-navigation">
        <button type="button" id="equipment-prev" aria-label="Предыдущая страница">←</button>
        <button type="button" id="equipment-next" aria-label="Следующая страница">→</button>
        <button type="button" id="equipment-close" aria-label="Закрыть">×</button>
      </div>
    </div>
    <div class="equipment-editor-content">
      <div id="equipment-catalog" aria-label="Рюкзак"></div>
      <div class="equipment-editor-hero">
        <div id="hero-equipment-slots" aria-label="Экипировка"></div>
        <div id="hero-consumable-slots" aria-label="Расходники"></div>
      </div>
    </div>`;
  document.body.append(dialog);
  const filter = dialog.querySelector('#equipment-filter');
  const catalog = dialog.querySelector('#equipment-catalog');
  const gear = dialog.querySelector('#hero-equipment-slots');
  const consumables = dialog.querySelector('#hero-consumable-slots');
  const prev = dialog.querySelector('#equipment-prev');
  const next = dialog.querySelector('#equipment-next');
  let hero = null, page = 0, selectedId = null, tooltip = null, previousFocus = null;
  for (const [value, text] of Object.entries({ all: 'Всё', head: 'Голова', boots: 'Обувь', gloves: 'Перчатки',
    belt: 'Пояс', chest: 'Грудь', melee: 'Ближнее оружие', ranged: 'Дальнее оружие', leftHand: 'Щит', other: 'Прочее', consumables: 'Расходники' })) {
    filter.add(new Option(text, value));
  }
  function matches(item) {
    const type = filter.value;
    if (type === 'all') return true;
    if (type === 'melee' || type === 'ranged') return !!item.attack && !!item.attack.isShot === (type === 'ranged');
    if (type === 'other') return item.allowedSlots.some(slot => slot === 'other1' || slot === 'other2');
    return item.allowedSlots.includes(type);
  }
  function hideTooltip() { tooltip?.remove(); tooltip = null; }
  function showTooltip(anchor, item, slot) {
    hideTooltip();
    tooltip = document.createElement('div');
    tooltip.className = 'editor-equipment-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    const heading = document.createElement('h3');
    heading.textContent = item?.name ?? names[slot];
    tooltip.append(heading);
    const line = (label, value) => {
      const p = document.createElement('p');
      p.textContent = `${label}: ${value}`;
      tooltip.append(p);
    };
    if (!item) line('Слот для', allowed[slot]);
    if (item?.attack) {
      const a = item.attack;
      const weaponTypes = { dagger: 'Кинжал', sword: item.hands === 2 ? 'Двуручный меч' : 'Одноручный меч',
        axe: item.hands === 2 ? 'Двуручный топор' : 'Одноручный топор', bow: 'Лук', crossbow: 'Арбалет', sling: 'Праща', staff: 'Посох', wand: 'Жезл', orb: 'Магическая сфера' };
      line('Оружие', weaponTypes[item.weaponType] ?? item.weaponType);
      line('ОД', a.apCost);
      line('Урон', `${a.damageBase} + ${a.damagePerStr ?? 0} × STR (${damageNames[a.damageType] ?? a.damageType})`);
      line('Точность', `${a.baseAccuracy}%`);
      line('Крит шанс', `${a.baseCritChance}%`);
      line('Дальность', `${a.minRange === a.range || a.minRange === undefined ? a.range : `${a.minRange}–${a.range}`} [${a.modifiable ? 'изменяемая' : 'неизменяемая'}]`);
      for (const part of a.bonusDamage ?? []) line('Дополнительный урон', `+${part.damage} ${damageNames[part.damageType] ?? part.damageType}`);
    }
    if (item?.ac !== undefined) {
      line('AC', item.ac);
      line('Прочность', item.indestructible ? 'Несокрушимый' : `${item.maxDurability} / ${item.maxDurability}`);
    }
    if (item?.consumableSlots !== undefined) line('Слоты расходников', item.consumableSlots);
    for (const [stat, value] of Object.entries(item?.modifiers ?? {})) {
      const p = document.createElement('p');
      p.textContent = `${value >= 0 ? '+' : ''}${value} ${modifiers[stat] ?? stat}`;
      tooltip.append(p);
    }
    if (item?.consumable) {
      const use = item.consumable;
      if (use.heal) line('Лечение', `+${use.heal} ОЗ`);
      if (use.cleansePoison) line('Эффект', 'Снимает яд');
      if (use.removeBleedingStacks) line('Эффект', 'Снимает 1 стак Кровотечения');
      if (use.spell) {
        line('Урон', `${use.spell.damageBase} ${damageNames[use.spell.damageType]}`);
        line('Дальность', `${use.spell.minRange}–${use.spell.range} [неизменяемая]`);
        line('АОЕ', `Квадрат ${use.spell.aoeSize}×${use.spell.aoeSize}`);
        line('LOS', 'Требует');
        line('Эффект', `Горение на ${use.spell.durationBase} хода`);
      }
      line('Применение', `${window.HeroSkillRules.consumableCost(hero, item)} ОД`);
    }
    const requiredSkill = window.HeroSkillRules.equipmentSkill(item);
    if (requiredSkill) line('Требуется', window.HeroSkills.BY_ID[requiredSkill].name);
    dialog.append(tooltip);
    const rect = anchor.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - tooltip.offsetHeight - 8))}px`;
  }
  function cell(item, slot, locked = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `editor-equipment-slot${locked ? ' locked' : ''}`;
    button.disabled = locked;
    button.setAttribute('aria-label', item?.name ?? names[slot] ?? 'Пустая ячейка');
    if (item || outlines[slot]) {
      const img = document.createElement('img');
      img.src = item?.iconPath ?? `assets/equipment/empty-${outlines[slot]}.png`;
      img.alt = '';
      img.draggable = false;
      if (!item) img.className = `equipment-outline${slot.startsWith('other') ? ' ring' : ''}`;
      button.append(img);
    }
    if (!locked && (item || slot)) {
      button.addEventListener('mouseenter', () => showTooltip(button, item, slot));
      button.addEventListener('mouseleave', hideTooltip);
      button.addEventListener('focus', () => showTooltip(button, item, slot));
      button.addEventListener('blur', hideTooltip);
    }
    return button;
  }
  function renderGear() {
    hideTooltip();
    gear.replaceChildren();
    for (const slot of order) {
      const id = slot === 'leftHand' && items[hero.equipment.rightHand]?.hands === 2 ? hero.equipment.rightHand : hero.equipment[slot];
      const button = cell(items[id], slot);
      button.dataset.slot = slot;
      button.classList.toggle('compatible', !!items[selectedId]?.allowedSlots.includes(slot) && window.HeroSkillRules.canEquip(hero, items[selectedId]));
      button.addEventListener('click', () => {
        if (selectedId && items[selectedId].allowedSlots.includes(slot)) Model.equip(hero, selectedId, slot);
        else Model.remove(hero, slot);
        selectedId = null;
        render();
      });
      gear.append(button);
    }
    consumables.replaceChildren();
    const count = Model.capacity(hero);
    for (let slot = 0; slot < 6; slot++) {
      const button = cell(items[hero.consumables[slot]], 'consumables', slot >= count);
      button.dataset.consumableSlot = slot;
      button.classList.toggle('compatible', slot < count && !!items[selectedId]?.consumable);
      button.addEventListener('click', () => {
        if (items[selectedId]?.consumable) Model.equip(hero, selectedId, slot);
        else Model.remove(hero, slot);
        selectedId = null;
        render();
      });
      consumables.append(button);
    }
  }
  function renderCatalog() {
    hideTooltip();
    const entries = Object.values(items).filter(matches);
    const pages = Math.max(1, Math.ceil(entries.length / 80));
    page = Math.max(0, Math.min(page, pages - 1));
    prev.disabled = page === 0;
    next.disabled = page === pages - 1;
    catalog.replaceChildren();
    for (let index = 0; index < 80; index++) {
      const item = entries[page * 80 + index];
      const button = cell(item);
      if (item) {
        button.dataset.itemId = item.id;
        const allowed = window.HeroSkillRules.canEquip(hero, item);
        button.setAttribute('aria-disabled', String(!allowed));
        button.classList.toggle('unavailable', !allowed);
        button.classList.toggle('selected', selectedId === item.id);
        // Keep the clicked DOM node alive between clicks so native dblclick works.
        button.addEventListener('click', () => {
          if (!allowed) return;
          selectedId = item.id;
          for (const node of catalog.children) node.classList.toggle('selected', node.dataset.itemId === selectedId);
          renderGear();
        });
        button.addEventListener('dblclick', () => {
          if (!allowed) return;
          Model.equip(hero, item.id);
          selectedId = null;
          render();
        });
      }
      catalog.append(button);
    }
  }
  function render() { renderCatalog(); renderGear(); }
  filter.addEventListener('change', () => { page = 0; selectedId = null; render(); });
  prev.addEventListener('click', () => { page--; renderCatalog(); });
  next.addEventListener('click', () => { page++; renderCatalog(); });
  dialog.querySelector('#equipment-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { hideTooltip(); hero = null; previousFocus?.focus(); });
  dialog.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
  window.EquipmentEditor = Object.freeze({
    open(mob, name) {
      Model.initialize(mob);
      hero = mob;
      previousFocus = document.activeElement;
      dialog.setAttribute('aria-label', `Экипировка — ${name}`);
      page = 0;
      filter.value = 'all';
      selectedId = null;
      render();
      if (!dialog.open) dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
    isOpen: () => dialog.open
  });
})();

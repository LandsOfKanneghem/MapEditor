(() => {
  'use strict';
  const Rules = window.HeroSkills;
  const dialog = document.createElement('dialog');
  dialog.id = 'hero-skills-dialog';
  dialog.setAttribute('aria-labelledby', 'hero-skills-title');
  dialog.innerHTML = `
    <header><h2 id="hero-skills-title">Навыки</h2><div id="hero-skills-budget"></div>
      <input type="search" id="hero-skills-search" aria-label="Поиск навыка" placeholder="Поиск навыка"></header>
    <div id="hero-skills-tree"></div>
    <footer><button type="button" id="save-hero-skills">Сохранить</button>
      <button type="button" id="close-hero-skills">Закрыть без сохранения</button></footer>`;
  document.body.append(dialog);
  const tree = dialog.querySelector('#hero-skills-tree');
  const search = dialog.querySelector('#hero-skills-search');
  const buttons = new Map(), groups = [];
  let hero = null, selected = [], level = 1, previousFocus = null;
  for (const group of Rules.GROUPS) {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = group.name;
    section.append(heading);
    const branches = [];
    for (const branch of group.branches) {
      const row = document.createElement('div');
      row.className = 'hero-skill-branch';
      const label = document.createElement('span');
      label.className = 'hero-skill-branch-name';
      label.textContent = branch.name;
      row.append(label);
      for (const [index, skill] of branch.skills.entries()) {
        if (index) {
          const arrow = document.createElement('span');
          arrow.className = 'hero-skill-arrow';
          arrow.textContent = '→';
          arrow.setAttribute('aria-hidden', 'true');
          row.append(arrow);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.skill = skill.id;
        button.setAttribute('aria-label', skill.name);
        const name = document.createElement('span');
        name.textContent = skill.rank ?? skill.name;
        const requirement = document.createElement('small');
        requirement.textContent = `${skill.minLevel} ур.`;
        button.append(name, requirement);
        button.addEventListener('click', () => { selected = Rules.toggle(selected, skill.id, level); render(); });
        row.append(button);
        buttons.set(skill.id, button);
      }
      branches.push({ row, text: `${branch.name} ${branch.skills.map(skill => skill.name).join(' ')}`.toLocaleLowerCase('ru') });
      section.append(row);
    }
    groups.push({ section, branches });
    tree.append(section);
  }
  function render() {
    const limit = Rules.capacity(level);
    dialog.querySelector('#hero-skills-budget').textContent = `Уровень: ${level} · Выбрано: ${selected.length} / ${limit} · Осталось: ${limit - selected.length}`;
    for (const [id, button] of buttons) {
      const chosen = selected.includes(id);
      const reason = chosen ? '' : Rules.reason(id, selected, level);
      button.disabled = !!reason;
      button.classList.toggle('selected', chosen);
      button.setAttribute('aria-pressed', String(chosen));
      button.title = chosen ? 'Снять навык вместе с зависимыми навыками.' : reason || 'Выбрать навык';
    }
    const query = search.value.trim().toLocaleLowerCase('ru');
    for (const { section, branches } of groups) {
      for (const branch of branches) branch.row.hidden = !branch.text.includes(query);
      section.hidden = branches.every(branch => branch.row.hidden);
    }
  }
  search.addEventListener('input', render);
  dialog.querySelector('#save-hero-skills').addEventListener('click', () => {
    hero.skills = Rules.normalize(selected, level);
    dialog.close();
  });
  dialog.querySelector('#close-hero-skills').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { hero = null; selected = []; previousFocus?.focus(); });
  window.HeroSkillsEditor = Object.freeze({
    open(mob, name) {
      if (!window.MapEquipment.HEROES.includes(mob.type) || mob.team !== 'ally') return;
      hero = mob;
      level = mob.progression?.level ?? 1;
      selected = Rules.normalize(mob.skills ?? [], level);
      previousFocus = document.activeElement;
      search.value = '';
      dialog.querySelector('#hero-skills-title').textContent = `Навыки — ${name}`;
      render();
      if (!dialog.open) dialog.showModal();
      tree.scrollTop = 0;
    },
    close() { if (dialog.open) dialog.close(); },
    isOpen: () => dialog.open
  });
})();

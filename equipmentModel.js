// Infinite editor catalog: a loadout stores IDs, equipping/removing never changes the catalog.
((root) => {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const Rules = node ? require('./mapEquipment.js') : root.MapEquipment;
  const Catalog = node ? require('./equipmentCatalog.js') : root.EquipmentCatalog;
  const items = Catalog.items;
  const SkillRules = node ? require('./data/heroSkillRules.js') : root.HeroSkillRules;
  function initialize(mob) {
    if (!Rules.HEROES.includes(mob.type) || mob.team !== 'ally') throw new Error('Экипировка доступна только союзным героям.');
    if (mob.equipment === undefined) {
      mob.equipment = { ...Rules.empty(), ...Catalog.defaults[mob.type] };
      mob.consumables = Array(6).fill(null);
    }
    Object.assign(mob, Rules.read(mob, items));
    return mob;
  }
  const capacity = mob => Rules.capacity(mob.equipment, items);
  function trimConsumables(mob) {
    for (let slot = capacity(mob); slot < 6; slot++) mob.consumables[slot] = null;
  }
  function equip(mob, id, slot) {
    const item = items[id];
    if (!item || !SkillRules.canEquip(mob, item)) return false;
    initialize(mob);
    if (item.consumable) {
      const count = capacity(mob);
      if (slot === undefined) slot = mob.consumables.findIndex((value, index) => index < count && value === null);
      if (slot === -1 && count) slot = 0;
      if (!Number.isInteger(slot) || slot < 0 || slot >= count) return false;
      mob.consumables[slot] = id;
    } else {
      slot ??= item.allowedSlots.find(key => mob.equipment[key] === null) ?? item.allowedSlots[0];
      if (!Rules.SLOTS.includes(slot) || !item.allowedSlots.includes(slot)) return false;
      if (slot === 'leftHand' && items[mob.equipment.rightHand]?.hands === 2) mob.equipment.rightHand = null;
      mob.equipment[slot] = id;
      if (slot === 'rightHand' && item.hands === 2) mob.equipment.leftHand = null;
      trimConsumables(mob);
    }
    return true;
  }
  function remove(mob, slot) {
    initialize(mob);
    if (Number.isInteger(slot)) {
      if (slot < 0 || slot >= capacity(mob)) return false;
      mob.consumables[slot] = null;
    } else {
      if (!Rules.SLOTS.includes(slot)) return false;
      if (slot === 'leftHand' && items[mob.equipment.rightHand]?.hands === 2) slot = 'rightHand';
      mob.equipment[slot] = null;
      trimConsumables(mob);
    }
    return true;
  }
  function reconcileSkills(mob) {
    if (!mob.equipment) return;
    for (const slot of Rules.SLOTS) if (!SkillRules.canEquip(mob, items[mob.equipment[slot]])) mob.equipment[slot] = null;
    trimConsumables(mob);
  }
  const api = Object.freeze({ initialize, capacity, equip, remove, reconcileSkills });
  if (node) module.exports = api;
  else root.EquipmentModel = api;
})(typeof window === 'undefined' ? globalThis : window);

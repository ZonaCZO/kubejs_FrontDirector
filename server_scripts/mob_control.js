// Mob Control — KubeJS 2001.6.5 / Forge 1.20.1
// Replaces InControl spawn filtering. Front Director is the only Warium spawner.

const MC_CONFIG = 'kubejs/config/front_director_v3.json'
let mcSafeZones = null
let mcRobotIds = null

const MC_BLOCKED_VANILLA = {
  'minecraft:zombie': true,
  'minecraft:zombie_villager': true,
  'minecraft:drowned': true,
  'minecraft:skeleton': true,
  'minecraft:stray': true,
  'minecraft:creeper': true,
  'minecraft:spider': true,
  'minecraft:enderman': true,
  'minecraft:witch': true,
  'minecraft:pillager': true,
  'minecraft:phantom': true,
  'minecraft:slime': true
}

const MC_RARE_SUPPORT = {
  'crusty_chunks:hunter': true,
  'crusty_chunks:reaper': true
}

// Enemy factions disabled for this pack. PMC and player-purchased units stay enabled.
const MC_BLOCKED_FACTION_UNITS = {
  'simpleenemymod:ruunit': true,
  'tacz_sewv:ru_medic': true,
  'tacz_sewv:ru_engineer': true,
  'tacz_sewv:ru_combat_engineer': true
}

let mcFactionCleanupTick = 0

function mcEntityId(entity) {
  try { return String(entity.type.arch$registryName()) } catch (ignored) {}
  try { return String(entity.type) } catch (ignored) {}
  return ''
}

function mcHasTag(entity, tag) {
  try { return entity.tags.contains(tag) } catch (ignored) {}
  return false
}

function mcInRect(x, z, rect) {
  return x >= Math.min(Number(rect.x1), Number(rect.x2)) &&
    x <= Math.max(Number(rect.x1), Number(rect.x2)) &&
    z >= Math.min(Number(rect.z1), Number(rect.z2)) &&
    z <= Math.max(Number(rect.z1), Number(rect.z2))
}

function mcLoadConfig() {
  if (mcSafeZones == null || mcRobotIds == null) {
    const config = JsonIO.read(MC_CONFIG)
    mcSafeZones = config && config.safeZones ? config.safeZones : []
    mcRobotIds = {}
    const configuredRobots = config && config.robotEntities ? config.robotEntities : []
    const rareSupport = config && config.rareSupportEntities ? config.rareSupportEntities : []
    for (let i = 0; i < configuredRobots.length; i++) {
      mcRobotIds[String(configuredRobots[i])] = true
    }
    for (let i = 0; i < rareSupport.length; i++) {
      mcRobotIds[String(rareSupport[i])] = true
    }
  }
}

function mcInSafeZone(entity) {
  mcLoadConfig()
  let zones=mcSafeZones
  try {
    const saved=String(entity.server.persistentData.getString('front_coop_settings'))
    if(saved)zones=JSON.parse(saved).safeZones
  } catch(ignored) {}
  for (let i = 0; i < zones.length; i++) {
    if (mcInRect(entity.x, entity.z, zones[i])) return true
  }
  return false
}

// A spawn egg is an explicit map-maker/admin action, not ambient spawning.
// Mark the entity before EntityEvents.spawned fires so both Mob Control and
// Front Director can distinguish it from Warium's native automatic spawns.
EntityEvents.checkSpawn(event => {
  if (String(event.type) !== 'SPAWN_EGG') return
  try { event.entity.addTag('fd_allow_manual') } catch (ignored) {}
})

EntityEvents.spawned(event => {
  const entity = event.entity
  const id = mcEntityId(entity)
  if (!id) return

  const manuallyPlaced = mcHasTag(entity, 'fd_allow_manual')

  // Creative spawn eggs deliberately override the pack's ambient-spawn
  // blacklists and safe-zone filter. The tag remains on the entity so the
  // periodic faction cleanup does not remove it later.
  if (manuallyPlaced) return

  if (MC_BLOCKED_FACTION_UNITS[id]) {
    event.cancel()
    return
  }

  // Old InControl vanilla-hostile blacklist.
  if (MC_BLOCKED_VANILLA[id]) {
    event.cancel()
    return
  }

  // Old InControl Cyberware mob blacklist.
  if (id.indexOf('cyber_ware_port:') === 0) {
    event.cancel()
    return
  }

  // Never filter Warium bullets, rockets, particles, ragdolls or other effects.
  // Only IDs listed as robots in the Front Director config are controlled.
  mcLoadConfig()
  if (MC_RARE_SUPPORT[id] && !mcHasTag(entity, 'fd_robot')) {
  event.cancel()
  return
}

  if (!mcRobotIds[id]) return

  // Automatic robots may never appear inside a configured safe zone.
  if (mcInSafeZone(entity)) {
    event.cancel()
    return
  }


  // Only robots summoned and tagged by Front Director are accepted.
  // Commands can opt in with {Tags:["fd_allow_manual"]}.
  if (!mcHasTag(entity, 'fd_robot')) {
    event.cancel()
  }
})

// Some mod events add entities after Forge's normal spawn checks. A small,
// infrequent sweep catches those and also removes units saved before this rule.
ServerEvents.tick(event => {
  mcFactionCleanupTick++
  if (mcFactionCleanupTick % 400 !== 0) return
  var iterator = event.server.overworld().getAllEntities().iterator()
  while (iterator.hasNext()) {
    var cleanupEntity = iterator.next()
    if (!MC_BLOCKED_FACTION_UNITS[mcEntityId(cleanupEntity)] || mcHasTag(cleanupEntity, 'fd_allow_manual')) continue
    try { cleanupEntity.discard() } catch (ignored) { cleanupEntity.remove('discarded') }
  }
})

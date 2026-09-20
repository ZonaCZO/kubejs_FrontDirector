// Front Director v3 — KubeJS 2001.6.5 / Forge 1.20.1
// Dynamic sector front. CaptureZone is not used.

var FD_BlockPos = Java.loadClass('net.minecraft.core.BlockPos')
var FD_Heightmap = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types')
var FD_BiomeTags = Java.loadClass('net.minecraft.tags.BiomeTags')
var FD_LostCities = Java.loadClass('mcjty.lostcities.LostCities')

var FD_CONFIG = 'kubejs/config/front_director_v3.json'

function fcHost(player) {
  try {
    var server=player.server, profile=server.getSingleplayerProfile()
    return server.isSingleplayer() && profile!=null && String(profile.getId())===String(player.uuid)
  } catch(ignored) {return false}
}
function fcOwner(player) {return fcHost(player) || player.hasPermissions(2)}
function fcGranted(player) {
  return fcOwner(player) || player.server.persistentData.getBoolean('front_coop_gm_'+String(player.uuid))
}
function fcCanEdit(player) {
  return fcGranted(player) && player.persistentData.getBoolean('front_coop_gm_mode')
}
function fcWorldConfig(server,config) {
  if(!config)return config
  var text=String(server.persistentData.getString('front_coop_settings'))
  if(text) {
    var areas=JSON.parse(text)
    config.warAreas=areas.warAreas; config.safeZones=areas.safeZones; config.origins=areas.origins
  }
  return config
}
function fcDraft(player) {
  var text=String(player.persistentData.getString('front_coop_draft'))
  return text?JSON.parse(text):{}
}
function fcRect(a,b) {
  return {x1:Math.min(a.x,b.x),z1:Math.min(a.z,b.z),x2:Math.max(a.x,b.x),z2:Math.max(a.z,b.z)}
}
function fcValidate(draft,maxSide) {
  if(!draft.war || !draft.safe || !draft.origin)throw new Error('Mark war area, safe area and enemy origin first.')
  var rects=[draft.war,draft.safe]
  for(var i=0;i<rects.length;i++){
    var r=rects[i],keys=['x1','z1','x2','z2']
    for(var k=0;k<keys.length;k++)if(!isFinite(Number(r[keys[k]])) || Math.abs(Number(r[keys[k]]))>29000000)throw new Error('Invalid coordinates.')
    if(r.x2-r.x1<64 || r.z2-r.z1<64 || r.x2-r.x1>maxSide || r.z2-r.z1>maxSide)throw new Error('Area side must be 64..'+maxSide+' blocks.')
  }
  var o=draft.origin
  if(!isFinite(o.x)||!isFinite(o.z)||!fdInRect(o.x,o.z,draft.war)||fdInRect(o.x,o.z,draft.safe))
    throw new Error('Enemy origin must be inside war area and outside safe area.')
}
function fcSend(player,message) {
  var server=player.server,draft=fcDraft(player)
  player.sendData('front:coop_data',{language:String(player.persistentData.getString('front_language')||'ru'),
    granted:fcGranted(player),owner:fcOwner(player),active:fcCanEdit(player),
    draft:JSON.stringify(draft),message:message||'',armed:Number(player.persistentData.getLong('front_coop_confirm'))>fdGameTime(server),paused:server.persistentData.getBoolean('front_gm_paused')})
}
NetworkEvents.dataReceived('front:coop_request',event=>{
  var player=event.player,server=player.server,action=String(event.data.action||'view'),message=''
  try {
    if(action==='view'){fcSend(player);return}
    if(!fcGranted(player))throw new Error('Only the host, an operator or appointed GM can configure war.')
    var now=fdGameTime(server)
    if(typeof fcuiAllow==='function' && !fcuiAllow(player,'legacy_'+action))return
    if(action==='mode') {
      player.persistentData.putBoolean('front_coop_gm_mode',!player.persistentData.getBoolean('front_coop_gm_mode'))
      player.persistentData.putLong('front_coop_confirm',0)
      fcSend(player);return
    }
    if(action==='grant' || action==='revoke') {
      if(!fcOwner(player))throw new Error('Only the host or an operator may appoint a GM.')
      var name=String(event.data.name||'')
      if(!/^[A-Za-z0-9_]{1,16}$/.test(name))throw new Error('Enter a player name.')
      var target=server.getPlayer(name)
      if(!target)throw new Error('The player must be online.')
      server.persistentData.putBoolean('front_coop_gm_'+String(target.uuid),action==='grant')
      if(action==='revoke')target.persistentData.putBoolean('front_coop_gm_mode',false)
      fcSend(player);return
    }
    if(!fcCanEdit(player))throw new Error('Enable GM mode first.')
    if(!fdInitialized && !fdInitialize(server))throw new Error('Front director could not initialize.')
    var draft=fcDraft(player),cfg=JsonIO.read('kubejs/config/front_coop.json')||{}
    if(action!=='apply' && action!=='arm') {
      if(String(player.level.dimension)!=='minecraft:overworld')throw new Error('Mark positions in the Overworld.')
      var here={x:Math.floor(player.x),z:Math.floor(player.z)}
      if(action==='war_a')draft.warA=here
      else if(action==='war_b'){if(!draft.warA)throw new Error('Mark first corner.');draft.war=fcRect(draft.warA,here)}
      else if(action==='safe_a')draft.safeA=here
      else if(action==='safe_b'){if(!draft.safeA)throw new Error('Mark first corner.');draft.safe=fcRect(draft.safeA,here)}
      else if(action==='origin')draft.origin=here
      else if(action==='auto') {
        var side=Number(event.data.side),direction=String(event.data.direction)
        if([1024,2048,4096].indexOf(side)<0 || side>Number(cfg.maxWarSide||4096))throw new Error('Invalid area size.')
        var radius=Number(cfg.defaultSafeRadius||128),half=side/2,inset=fdZoneSize()
        draft.war=fcRect({x:here.x-half,z:here.z-half},{x:here.x+half,z:here.z+half})
        draft.safe=fcRect({x:here.x-radius,z:here.z-radius},{x:here.x+radius,z:here.z+radius})
        draft.origin={x:here.x,z:here.z}
        if(direction==='north')draft.origin.z-=half-inset
        else if(direction==='south')draft.origin.z+=half-inset
        else if(direction==='west')draft.origin.x-=half-inset
        else if(direction==='east')draft.origin.x+=half-inset
        else throw new Error('Invalid direction.')
      } else if(action==='clear')draft={}
      else throw new Error('Unknown action.')
      player.persistentData.putString('front_coop_draft',JSON.stringify(draft))
      player.persistentData.putLong('front_coop_confirm',0)
    } else {
      fcValidate(draft,Number(cfg.maxWarSide||4096))
      if(action==='arm'){
        player.persistentData.putLong('front_coop_confirm',now+200)
        player.persistentData.putLong('front_coop_revision',server.persistentData.getLong('front_coop_revision'))
      }
      else {
        if(Number(player.persistentData.getLong('front_coop_confirm'))<=now)throw new Error('Preview and confirm within 10 seconds.')
        if(Number(player.persistentData.getLong('front_coop_revision'))!==Number(server.persistentData.getLong('front_coop_revision')))
          throw new Error('Another GM changed boundaries. Review and confirm again.')
        // Validate the whole tactical sector, not just the origin block.
        var center=fdSectorCenter(fdSX(draft.origin.x),fdSZ(draft.origin.z))
        if(!fdInRect(center.x,center.z,draft.war)||fdInRect(center.x,center.z,draft.safe))
          throw new Error('The origin sector overlaps the safe area or lies outside war.')
        var areas={warAreas:[draft.war],safeZones:[draft.safe],origins:[draft.origin]}
        server.persistentData.putString('front_coop_settings',JSON.stringify(areas))
        server.persistentData.putLong('front_coop_revision',Number(server.persistentData.getLong('front_coop_revision'))+1)
        fdConfig=fcWorldConfig(server,fdConfig)
        var existing=fdWorld(server).getAllEntities().iterator()
        while(existing.hasNext()){
          var entity=existing.next()
          if(fdIsRobot(entity) && fdInSafeZone(entity.x,entity.z))entity.discard()
        }
        fdTerrainCache={};fdCityCache={};fdSupplyCache={}
        fdSetControl(fdSX(draft.origin.x),fdSZ(draft.origin.z),100)
        fdRebuildSupply();fdSave(server)
        server.persistentData.putBoolean('front_gm_paused',true)
        player.persistentData.putLong('front_coop_confirm',0)
        message='Applied. War paused; review the CC map, then resume in HQ.'
      }
    }
    fcSend(player,message)
  } catch(error) {fcSend(player,String(error).slice(0,180))}
})
PlayerEvents.loggedOut(event=>{
  event.player.persistentData.putBoolean('front_coop_gm_mode',false)
  event.player.persistentData.putLong('front_coop_confirm',0)
})
var FD_CHECK_TICKS = 400 // 20 seconds; low-CPU profile

var fdConfig = null
var fdState = {}
var fdTick = 0
var fdExpansionClock = 0
var fdDirty = false
var fdInitialized = false
var fdCityCache = {}
var fdCombatTick = 0
var fdSharedIntel = null
var fdTrackedRobots = []
var fdTrackedSem = []
var fdEntityScanTick = -999999
var fdCombatCursor = 0
var fdTerrainCache = {}
var fdSupplyCache = {}
var fdSettlementCivilians = {}
var fdOps = { liberated: {}, protection: {}, garrisons: {}, alerts: {} }
var fdOpsDirty = false
var fdMapConfigWarning = ''
function fdZoneSize() { return Number(fdConfig.frontZoneSize || 64) }
function fdMajorX(x) { return Math.floor(x / Number(fdConfig.sectorSize)) }
function fdMajorZ(z) { return Math.floor(z / Number(fdConfig.sectorSize)) }
function fdMajorKey(sx,sz) {
  return fdKey(fdMajorX((sx+0.5)*fdZoneSize()),fdMajorZ((sz+0.5)*fdZoneSize()))
}
function fdZoneLabel(sx,sz) {
  var n=Number(fdConfig.sectorSize)/fdZoneSize()
  return String.fromCharCode(65+sx-Math.floor(sx/n)*n)+(1+sz-Math.floor(sz/n)*n)
}
function fdMajorCenter(sx,sz) {
  var size=Number(fdConfig.sectorSize)
  return {x:(sx+0.5)*size,z:(sz+0.5)*size}
}
function fdStateStorage() { return 'front_director_v8_zones_'+fdZoneSize() }
function fdOpsStorage() { return 'front_director_v8_ops_'+fdZoneSize() }
function fdExpandLegacy(source) {
  var expanded={},n=Number(fdConfig.sectorSize)/fdZoneSize()
  Object.keys(source || {}).forEach(key => {
    var pair=key.split(','),sx=Number(pair[0]),sz=Number(pair[1])
    if(!isFinite(sx) || !isFinite(sz)) return
    for(var x=0;x<n;x++) for(var z=0;z<n;z++) expanded[fdKey(sx*n+x,sz*n+z)]=source[key]
  })
  return expanded
}

// Called by the map bridge every 20 seconds, not on every game tick.
function fdRefreshMapConfig(server) {
  if (!fdInitialized) return
  try {
    var next = fcWorldConfig(server, JsonIO.read(FD_CONFIG))
    if (!next) throw new Error('Config missing or invalid JSON')
    if (Number(next.sectorSize)!==Number(fdConfig.sectorSize))
      throw new Error('sectorSize changed: live reload refused to preserve sector ownership; use a planned war reset')
    if(Number(next.frontZoneSize || 64)!==fdZoneSize()) throw new Error('frontZoneSize change requires planned migration; live reload refused')
    var lists=['warAreas','safeZones','origins']
    for(var l=0;l<lists.length;l++) {
      var list=next[lists[l]]
      if(list==null || typeof list.length==='undefined') throw new Error('Invalid '+lists[l])
      for(var i=0;i<list.length;i++) {
        var fields=lists[l]==='origins'?['x','z']:['x1','z1','x2','z2']
        for(var f=0;f<fields.length;f++) {
          if(list[i][fields[f]]==null || !isFinite(Number(list[i][fields[f]]))) throw new Error('Invalid coordinate in '+lists[l])
        }
      }
    }
    var changed=JSON.stringify([next.warAreas,next.safeZones,next.origins])!==
      JSON.stringify([fdConfig.warAreas,fdConfig.safeZones,fdConfig.origins])
    if(changed) {
      fdConfig.warAreas=next.warAreas
      fdConfig.safeZones=next.safeZones
      fdConfig.origins=next.origins
      fdTerrainCache={}; fdCityCache={}; fdSupplyCache={}
      for(var o=0;o<fdConfig.origins.length;o++) {
        var origin=fdConfig.origins[o],sx=fdSX(origin.x),sz=fdSZ(origin.z)
        if(fdAllowedSector(sx,sz) && fdState[fdKey(sx,sz)]==null) fdSetControl(sx,sz,100)
      }
      fdRebuildSupply()
      console.info('[Front Map] War areas, safe zones and origins reloaded; existing sector state preserved')
    }
    fdMapConfigWarning=''
  } catch(error) {
    var warning=String(error)
    if(warning!==fdMapConfigWarning) console.error('[Front Map] Keeping previous config: '+warning)
    fdMapConfigWarning=warning
  }
}

var FD_AI_INTERVAL = 80 // 4 seconds; low-CPU combat network
var FD_ENTITY_SCAN_INTERVAL = 400 // full world scan only every 20 seconds
var FD_AI_BATCH = 8 // spread robot AI work across multiple checks
var FD_INTEL_TTL = 20 * 30 // 30 seconds
var FD_SEM_DETECTION_RANGE_SQ = 16 * 16
var FD_INTEL_GRID = 32 // reported coordinates are deliberately approximate

function fdCmd(server, command) {
  try { return server.runCommandSilent(command) } catch (ignored) { return 0 }
}

function fdTell(server, text, color) {
  var safe = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  fdCmd(server, `tellraw @a {"text":"[Фронт] ${safe}","color":"${color || 'gold'}"}`)
}

function fdLoadConfig(server) {
  fdConfig = fcWorldConfig(server, JsonIO.read(FD_CONFIG))
  if (!fdConfig) throw new Error(`Не найден ${FD_CONFIG}`)
  var major=Number(fdConfig.sectorSize),small=fdZoneSize()
  if(!isFinite(major) || !isFinite(small) || small<32 || major%small!==0 || major/small>8)
    throw new Error('frontZoneSize must divide sectorSize, minimum 32 and maximum 8 zones per side')
  var requiredLists=['warAreas','safeZones','origins','robotEntities','alliedEntities']
  for(var l=0;l<requiredLists.length;l++) {
    var list=fdConfig[requiredLists[l]]
    if(list==null || typeof list.length==='undefined')throw new Error('Invalid '+requiredLists[l]+' list')
  }
  if(fdConfig.warAreas.length===0)throw new Error('At least one war area is required')
  if(fdConfig.origins.length===0)throw new Error('At least one invasion origin is required')
  if(fdConfig.robotEntities.length===0)throw new Error('robotEntities cannot be empty')
  var numericRules={
    expansionIntervalMinutes:[0.05,1440],sectorsAdvancedPerCycle:[1,128],
    expansionControlGain:[0,100],expansionSourceControl:[1,100],activeRadiusSectors:[0,8],
    absoluteRobotCapPerSector:[1,256],minimumSurfaceY:[-64,320],maximumSurfaceY:[-63,384]
  }
  Object.keys(numericRules).forEach(name=>{
    var value=Number(fdConfig[name]),range=numericRules[name]
    if(!isFinite(value)||value<range[0]||value>range[1])throw new Error('Invalid '+name+': '+fdConfig[name])
  })
  var optionalNumericRules={siegeMortarMinimum:[0,4],settlementCivilianMinimum:[1,64],
    backgroundSectorsPerCycle:[0,16],rememberedDefenceMinimum:[1,64]}
  Object.keys(optionalNumericRules).forEach(name=>{
    if(fdConfig[name]==null)return
    var value=Number(fdConfig[name]),range=optionalNumericRules[name]
    if(!isFinite(value)||value<range[0]||value>range[1])throw new Error('Invalid '+name+': '+fdConfig[name])
  })
  if(Number(fdConfig.minimumSurfaceY)>=Number(fdConfig.maximumSurfaceY))throw new Error('minimumSurfaceY must be lower than maximumSurfaceY')
  var rectLists=['warAreas','safeZones']
  for(var r=0;r<rectLists.length;r++)for(var i=0;i<fdConfig[rectLists[r]].length;i++) {
    var rect=fdConfig[rectLists[r]][i]
    for(var f=0;f<4;f++)if(!isFinite(Number(rect[['x1','z1','x2','z2'][f]])))throw new Error('Invalid coordinate in '+rectLists[r])
  }
  for(var o=0;o<fdConfig.origins.length;o++)if(!isFinite(Number(fdConfig.origins[o].x))||!isFinite(Number(fdConfig.origins[o].z)))throw new Error('Invalid invasion origin')
}

function fdWorld(server) {
  return server.overworld()
}

function fdKey(sx, sz) { return sx + ',' + sz }
function fdSX(x) { return Math.floor(x / fdZoneSize()) }
function fdSZ(z) { return Math.floor(z / fdZoneSize()) }
function fdOptionNumber(name, fallback) {
  return fdConfig[name] == null ? fallback : Number(fdConfig[name])
}

var fdLastGameTime = 0
var fdGameTimeWarningShown = false
function fdGameTime(server) {
  try {
    var value=Number(fdWorld(server).getGameTime())
    if(isFinite(value)){fdLastGameTime=value;return value}
  } catch (firstError) {
    try {
      var fallback=Number(fdWorld(server).getDayTime())
      if(isFinite(fallback)){fdLastGameTime=fallback;return fallback}
    } catch (secondError) {}
    if(!fdGameTimeWarningShown){console.warn('[Front Director] Cannot read world game time: '+firstError);fdGameTimeWarningShown=true}
  }
  return fdLastGameTime
}

function fdOpsLoad(server) {
  var migrated = false
  try {
    migrated=server.persistentData.contains(fdOpsStorage())
    fdOps = server.persistentData.contains(migrated?fdOpsStorage():'front_director_v6_ops')
      ? JSON.parse(String(server.persistentData.getString(migrated?fdOpsStorage():'front_director_v6_ops')))
      : { liberated: {}, protection: {}, garrisons: {}, alerts: {} }
  } catch (error) {
    console.error('[Front Director v6] operations state reset: ' + error)
    fdOps = { liberated: {}, protection: {}, garrisons: {}, alerts: {} }
  }
  if (!fdOps.liberated) fdOps.liberated = {}
  if (!fdOps.protection) fdOps.protection = {}
  if (!fdOps.garrisons) fdOps.garrisons = {}
  if (!fdOps.alerts) fdOps.alerts = {}
  if(!migrated) {
    fdOps.liberated=fdExpandLegacy(fdOps.liberated)
    fdOps.protection=fdExpandLegacy(fdOps.protection)
    fdOps.alerts=fdExpandLegacy(fdOps.alerts)
    fdOpsDirty=true
    fdOpsSave(server)
  }
}

function fdOpsSave(server) {
  if (!fdOpsDirty) return
  server.persistentData.putString(fdOpsStorage(), JSON.stringify(fdOps))
  fdOpsDirty = false
}

function fdRandomFrom(list, fallback) {
  if (list == null || list.length === 0) return fallback
  return String(list[Math.floor(Math.random() * list.length)])
}

function fdInfantryType() {
  return fdRandomFrom(fdConfig.infantryEntities, fdRandomFrom([
    'crusty_chunks:striker',
    'crusty_chunks:striker',
    'crusty_chunks:rifler',
    'crusty_chunks:rifler',
    'crusty_chunks:worker',
    'crusty_chunks:breacher',
    'crusty_chunks:scout',
    'crusty_chunks:assassin'
  ], 'crusty_chunks:striker'))
}

function fdSupportType() {
  return fdRandomFrom(fdConfig.supportEntities, fdRandomFrom([
    'crusty_chunks:breacher',
    'crusty_chunks:scout',
    'crusty_chunks:assassin',
    'crusty_chunks:commander'
  ], 'crusty_chunks:breacher'))
}

function fdIsAircraftType(type) {
  var aircraft = fdConfig.aircraftEntities || ['crusty_chunks:hunter']
  for (var i = 0; i < aircraft.length; i++) {
    if (String(aircraft[i]) === String(type)) return true
  }
  return false
}

function fdSectorCenter(sx, sz) {
  var size = fdZoneSize()
  return { x: sx * size + Math.floor(size / 2), z: sz * size + Math.floor(size / 2) }
}

function fdInRect(x, z, rect) {
  return x >= Math.min(rect.x1, rect.x2) && x <= Math.max(rect.x1, rect.x2) &&
    z >= Math.min(rect.z1, rect.z2) && z <= Math.max(rect.z1, rect.z2)
}

function fdInWarArea(x, z) {
  for (var i = 0; i < fdConfig.warAreas.length; i++) {
    if (fdInRect(x, z, fdConfig.warAreas[i])) return true
  }
  return false
}

function fdInSafeZone(x, z) {
  for (var i = 0; i < fdConfig.safeZones.length; i++) {
    if (fdInRect(x, z, fdConfig.safeZones[i])) return true
  }
  return false
}

function fdAllowedSector(sx, sz) {
  var c = fdSectorCenter(sx, sz)
  return fdInWarArea(c.x, c.z) && !fdInSafeZone(c.x, c.z)
}

function fdBiomeInfoAtLoaded(level, x, z) {
  if (!level.getChunkSource().hasChunk(x >> 4, z >> 4)) return null
  try {
    var y = level.getHeight(FD_Heightmap.MOTION_BLOCKING_NO_LEAVES, x, z)
    var holder = level.getBiome(new FD_BlockPos(x, y, z))
    var key = holder.unwrapKey()
    var id=key.isPresent()?String(key.get().location()):''
    var ocean=false
    try{ocean=holder.is(FD_BiomeTags.IS_OCEAN)}catch(ignored){}
    return {id:id,ocean:ocean||id.indexOf('ocean')>=0}
  } catch (ignored) {}
  return null
}

function fdBiomeIdAtLoaded(level, x, z) {
  var info=fdBiomeInfoAtLoaded(level,x,z)
  return info?info.id:''
}

function fdSectorTerrain(level, sx, sz) {
  var key = fdKey(sx, sz)
  if (fdTerrainCache[key] != null) return fdTerrainCache[key]
  var size = fdZoneSize()
  var startX = sx * size
  var startZ = sz * size
  var points = [[0.5,0.5],[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]]
  var peaks = 0
  var rivers = 0
  var oceans = 0
  var known = 0
  for (var i = 0; i < points.length; i++) {
    var info = fdBiomeInfoAtLoaded(level,
      Math.floor(startX + size * points[i][0]),
      Math.floor(startZ + size * points[i][1]))
    if (!info) continue
    var id=info.id
    known++
    if (id.indexOf('peak') >= 0 || id.indexOf('mountain') >= 0) peaks++
    if (id.indexOf('river') >= 0) rivers++
    if (info.ocean) oceans++
  }
  // Unknown/unloaded terrain never forces chunk generation on the server thread.
  var result = { name: 'обычная местность', factor: 1.0 }
  if (oceans > 0 && oceans / known >= 0.5) result = { name: 'океан', factor: 0, ocean: true }
  else if (rivers > 0) result = { name: 'река', factor: Math.min(0.05,fdOptionNumber('riverExpansionFactor', 0.05)) }
  else if (peaks > 0) result = { name: 'горы', factor: fdOptionNumber('peakExpansionFactor', 0.35) }
  if (known === points.length) fdTerrainCache[key] = result
  return result
}

function fdControl(sx, sz) {
  var v = fdState[fdKey(sx, sz)]
  return v == null ? 0 : Number(v)
}

function fdSetControl(sx, sz, value) {
  var key = fdKey(sx, sz)
  var old = fdControl(sx, sz)
  var next = Math.max(0, Math.min(100, Math.round(value)))
  if (old === next) return
  if (next === 0) delete fdState[key]
  else fdState[key] = next
  fdDirty = true
}

function fdSave(server) {
  if (!fdDirty) return
  server.persistentData.putString(fdStateStorage(), JSON.stringify(fdState))
  fdDirty = false
}

function fdLoadState(server) {
  var migrated = false
  try {
    migrated=server.persistentData.contains(fdStateStorage())
    fdState = server.persistentData.contains(migrated?fdStateStorage():'front_director_v3_state')
      ? JSON.parse(String(server.persistentData.getString(migrated?fdStateStorage():'front_director_v3_state')))
      : {}
  } catch (error) {
    console.error('[Front Director v3] state reset: ' + error)
    fdState = {}
  }
  if(!migrated) { fdState=fdExpandLegacy(fdState); fdDirty=true }
  for (var i = 0; i < fdConfig.origins.length; i++) {
    fdSetControl(
      fdSX(fdConfig.origins[i].x),
      fdSZ(fdConfig.origins[i].z),
      100
    )
  }
  fdSave(server)
}

function fdNearestOriginDistance(sx, sz) {
  var c = fdSectorCenter(sx, sz)
  var best = 999999999
  for (var i = 0; i < fdConfig.origins.length; i++) {
    var dx = c.x - Number(fdConfig.origins[i].x)
    var dz = c.z - Number(fdConfig.origins[i].z)
    best = Math.min(best, Math.sqrt(dx * dx + dz * dz))
  }
  return best
}

function fdStrength(sx, sz) {
  var distance = fdNearestOriginDistance(sx, sz)
  var falloff = Math.max(0.20, 1.0 - distance / Number(fdConfig.fullSafetyDistance))
  return falloff
}

function fdNeighborHasControl(sx, sz, minimum) {
  return fdControl(sx + 1, sz) >= minimum || fdControl(sx - 1, sz) >= minimum ||
    fdControl(sx, sz + 1) >= minimum || fdControl(sx, sz - 1) >= minimum
}

function fdIsFrontier(sx, sz) {
  var control = fdControl(sx, sz)
  if (control > 0 && control < 100) return true
  if (control === 0) return fdNeighborHasControl(sx, sz, Number(fdConfig.expansionSourceControl))
  return fdControl(sx + 1, sz) < 50 || fdControl(sx - 1, sz) < 50 ||
    fdControl(sx, sz + 1) < 50 || fdControl(sx, sz - 1) < 50
}

function fdRebuildSupply() {
  var supplied = {}
  var queue = []
  var minimum = fdOptionNumber('supplyControlMinimum', 50)
  for (var i = 0; i < fdConfig.origins.length; i++) {
    var sx = fdSX(fdConfig.origins[i].x)
    var sz = fdSZ(fdConfig.origins[i].z)
    var key = fdKey(sx, sz)
    supplied[key] = true
    queue.push({sx: sx, sz: sz})
  }
  var dirs = [[1,0],[-1,0],[0,1],[0,-1]]
  for(var q=0;q<queue.length;q++) {
    var current = queue[q]
    for (var d = 0; d < dirs.length; d++) {
      var nx = current.sx + dirs[d][0]
      var nz = current.sz + dirs[d][1]
      var nk = fdKey(nx, nz)
      if (supplied[nk] || fdControl(nx, nz) < minimum) continue
      supplied[nk] = true
      queue.push({sx: nx, sz: nz})
    }
  }
  fdSupplyCache = supplied
}

function fdIsSupplied(sx, sz) {
  return fdSupplyCache[fdKey(sx, sz)] === true
}

function fdRememberedResistance(server,sx,sz) {
  fwLoad(server)
  var defence=fwData.defence[fdKey(sx,sz)] || {}
  var garrison=fdOps.garrisons[fdMajorKey(sx,sz)]
  var strength=Math.max(0,Number(defence.strength || 0))
  return {strength:strength,garrison:garrison && Number(garrison.strength)>0,
    sufficient:Boolean(defence.sufficient) || strength>=fdOptionNumber('rememberedDefenceMinimum',5)}
}

function fdBackgroundTerrain(server,level,sx,sz,survey) {
  var key=fdKey(sx,sz)
  if(fdTerrainCache[key]!=null)return fdTerrainCache[key]
  var record=survey[key]
  if(!record || Number(record.known || 0)<1) {
    return fdConfig.backgroundRequiresKnownTerrain===false ? {name:'обычная местность',factor:1.0} : null
  }
  if(record.ocean || record.terrain==='ocean')return {name:'океан',factor:0,ocean:true}
  if(record.river || record.terrain==='river')return {name:'река',factor:Math.min(0.05,fdOptionNumber('riverExpansionFactor',0.05))}
  if(record.mountain || record.terrain==='mountain')return {name:'горы',factor:fdOptionNumber('peakExpansionFactor',0.35)}
  return {name:'обычная местность',factor:1.0}
}

function fdApplyIsolation(server) {
  fdRebuildSupply()
  var decay = fdOptionNumber('isolatedControlLossPerCycle', 8)
  Object.keys(fdState).forEach(key => {
    if (fdSupplyCache[key]) return
    var pair = key.split(',')
    fdSetControl(Number(pair[0]), Number(pair[1]), Number(fdState[key]) - decay)
  })
}

function fdStrategicExpansion(server) {
  var level = fdWorld(server)
  var nearby = fdActiveSectors(server, level)
  var backgroundEnabled=fdConfig.backgroundExpansionEnabled!==false
  var survey={}
  try {survey=JSON.parse(String(server.persistentData.getString('front_cc_terrain')) || '{}')}catch(ignored){survey={}}
  var candidates = []
  var seen = {}
  var dirs = [[1,0],[-1,0],[0,1],[0,-1]]

  Object.keys(fdState).forEach(key => {
    var pair = key.split(',')
    var sx = Number(pair[0])
    var sz = Number(pair[1])
    if (fdControl(sx, sz) < Number(fdConfig.expansionSourceControl)) return

    for (var d = 0; d < dirs.length; d++) {
      var nx = sx + dirs[d][0]
      var nz = sz + dirs[d][1]
      var nk = fdKey(nx, nz)
      var background=!nearby[nk]
      if (background && !backgroundEnabled) continue
      if (seen[nk] || !fdAllowedSector(nx, nz) || fdControl(nx, nz) >= 100) continue
      if (Number(fdOps.protection[nk] || 0) > fdGameTime(server)) continue
      var resistance=fdRememberedResistance(server,nx,nz)
      // Remembered forces hold an unloaded sector until a player returns to command the battle.
      if(background && (resistance.garrison || resistance.sufficient))continue
      var backgroundTerrain=background?fdBackgroundTerrain(server,level,nx,nz,survey):null
      // Never load/generate a chunk merely to move the strategic simulation.
      if(background && backgroundTerrain==null)continue
      seen[nk] = true
      candidates.push({ sx: nx, sz: nz, background:background, terrain:backgroundTerrain, resistance:resistance })
    }
  })

  if (candidates.length === 0) return
  candidates.sort((a, b) => Number(a.background)-Number(b.background) || fdNearestOriginDistance(a.sx, a.sz) - fdNearestOriginDistance(b.sx, b.sz))
  var selected=[]
  var backgroundLimit=Math.max(0,Math.floor(fdOptionNumber('backgroundSectorsPerCycle',fdConfig.sectorsAdvancedPerCycle)))
  var backgroundUsed=0
  for(var c=0;c<candidates.length && selected.length<Number(fdConfig.sectorsAdvancedPerCycle);c++) {
    if(candidates[c].background && backgroundUsed>=backgroundLimit)continue
    selected.push(candidates[c])
    if(candidates[c].background)backgroundUsed++
  }

  for (var i = 0; i < selected.length; i++) {
    var candidate=selected[i]
    var terrain = candidate.background ? candidate.terrain : fdSectorTerrain(level, candidate.sx, candidate.sz)
    if (terrain.ocean) continue
    // River crossings are rare attempts rather than a rounded minimum gain.
    if (terrain.name === 'река' && Math.random() >= terrain.factor) continue
    var strategicGain = Math.max(1, Math.round(Number(fdConfig.expansionControlGain) *
      fdStrength(candidate.sx, candidate.sz) * terrain.factor))
    var candidateKey = fdKey(candidate.sx, candidate.sz)
    var garrison = fdOps.garrisons[fdMajorKey(candidate.sx,candidate.sz)]
    if (garrison && Number(garrison.strength) > 0) {
      strategicGain -= Number(garrison.strength) * fdOptionNumber('garrisonDefensePerSoldier', 3)
      fdOps.alerts[candidateKey] = Math.min(4, Number(fdOps.alerts[candidateKey] || 0) + 1)
      fdOpsDirty = true
      if (strategicGain <= 0) continue
    }
    if (fwMissionEffect(server,candidateKey,'headquarters') || fwMissionEffect(server,candidateKey,'depot')) continue
    if(candidate.background && candidate.resistance.strength>0)strategicGain-=candidate.resistance.strength*fdOptionNumber('garrisonDefensePerSoldier',3)
    if(strategicGain<=0)continue
    var oldControl=fdControl(candidate.sx,candidate.sz)
    fdSetControl(candidate.sx, candidate.sz,fdControl(candidate.sx, candidate.sz) + strategicGain)
    if(oldControl===0 && fdControl(candidate.sx,candidate.sz)>0) fwMail(server,candidateKey,'advance')
  }
  fdSave(server)
  fdOpsSave(server)
}

function fdCount(server, selector) {
  fdCmd(server, 'scoreboard players set #fdscan fd_tmp 0')
  fdCmd(server, `execute as ${selector} run scoreboard players add #fdscan fd_tmp 1`)
  return fdCmd(server, 'scoreboard players get #fdscan fd_tmp')
}

function fdSectorBox(sx, sz) {
  var size = fdZoneSize()
  return `x=${sx * size},y=-64,z=${sz * size},dx=${size - 1},dy=384,dz=${size - 1}`
}

function fdRobotSelector(sx, sz) {
  return `@e[tag=fd_robot,${fdSectorBox(sx, sz)}]`
}

function fdLiberateSector(server, sx, sz, liberator) {
  // Only Front Director robots are removed. Players, SEM/PMC soldiers,
  // villagers and map-maker entities are deliberately untouched.
  fdCmd(server, `kill ${fdRobotSelector(sx, sz)}`)
  fdTrackedRobots = fdTrackedRobots.filter(robot => {
    if (!robot || !robot.isAlive()) return false
    return fdSX(robot.x) !== sx || fdSZ(robot.z) !== sz
  })
  var who = liberator == null ? 'игроком' : String(liberator.username)
  var key = fdKey(sx, sz)
  fdOps.liberated[key] = true
  fdOps.protection[key] = fdGameTime(server) + fdOptionNumber('liberationProtectionMinutes', 15) * 60 * 20
  fdOps.alerts[key] = 0
  fdOpsDirty = true
  if (liberator != null) fdScoreAdd(server, liberator, 'front_sectors', 1)
  fwMail(server,key,'liberated')
}

function fdDefenderCount(server, sx, sz) {
  var box = fdSectorBox(sx, sz)
  var total = fdCount(server, `@a[${box}]`)
  for (var i = 0; i < fdConfig.alliedEntities.length; i++) {
    total += fdCount(server, `@e[type=${fdConfig.alliedEntities[i]},${box}]`)
  }
  return total
}

function fdIsRobot(entity) {
  var id = String(entity.type)
  for (var i = 0; i < fdConfig.robotEntities.length; i++) {
    if (id === String(fdConfig.robotEntities[i])) return true
  }
  var rare = fdConfig.rareSupportEntities || []
  for (var r = 0; r < rare.length; r++) {
    if (id === String(rare[r])) return true
  }
  return entity.tags && entity.tags.contains && entity.tags.contains('fd_robot')
}

function fdEntityId(entity) {
  try { return String(entity.type.arch$registryName()) } catch (ignored) {}
  try { return String(entity.type) } catch (ignored) {}
  return ''
}

function fdIsDefenderEntity(entity) {
  try { if (entity.isPlayer()) return true } catch (ignored) {}
  var id = fdEntityId(entity)
  for (var i = 0; i < fdConfig.alliedEntities.length; i++) {
    if (id === String(fdConfig.alliedEntities[i])) return true
  }
  // All three Simple Enemy Mod armies are valid Warium targets.
  return id.indexOf('simpleenemymod:') === 0
}

function fdIsCivilianEntity(entity) {
  var id=fdEntityId(entity)
  var types=fdConfig.settlementCivilianEntities || ['minecraft:villager','slimpatch:male_villager','slimpatch:female_villager']
  for(var i=0;i<types.length;i++)if(id===String(types[i]))return true
  try { if(String(entity.getClass().getName()).indexOf('com.javic.slimpatch.entity.')===0)return true } catch(ignored) {}
  return false
}

function fdDistanceSq(a, b) {
  var dx = a.x - b.x
  var dy = a.y - b.y
  var dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

function fdHasLineOfSight(observer, target) {
  try { return observer.getSensing().hasLineOfSight(target) } catch (ignored) {}
  try { return observer.hasLineOfSight(target) } catch (ignored) {}
  return false
}

function fdRememberTarget(target) {
  fdSharedIntel = {
    x: Math.round(target.x / FD_INTEL_GRID) * FD_INTEL_GRID,
    y: Math.round(target.y),
    z: Math.round(target.z / FD_INTEL_GRID) * FD_INTEL_GRID,
    expires: fdCombatTick + FD_INTEL_TTL,
    target: target
  }
}

function fdAdvanceDestination(level, robot) {
  var sx = fdSX(robot.x)
  var sz = fdSZ(robot.z)
  var currentControl = fdControl(sx, sz)
  if (currentControl <= 0) return null

  var dirs = [[1,0],[-1,0],[0,1],[0,-1]]
  var best = null
  var bestScore = -999999
  for (var i = 0; i < dirs.length; i++) {
    var nx = sx + dirs[i][0]
    var nz = sz + dirs[i][1]
    if (!fdAllowedSector(nx, nz)) continue
    var neighborControl = fdControl(nx, nz)
    if (neighborControl >= currentControl && neighborControl >= 70) continue
    var terrain = fdSectorTerrain(level, nx, nz)
    var score = (currentControl - neighborControl) * 10 + fdNearestOriginDistance(nx, nz) / 256
    score -= (1.0 - terrain.factor) * fdOptionNumber('terrainPathPenalty', 500)
    if (score > bestScore) {
      bestScore = score
      best = fdSectorCenter(nx, nz)
    }
  }
  if (best == null) return null
  if (!level.getChunkSource().hasChunk(best.x >> 4, best.z >> 4)) return null
  best.y = level.getHeight(FD_Heightmap.MOTION_BLOCKING_NO_LEAVES, best.x, best.z)
  return best
}

function fdCombatNetwork(server) {
  var level = fdWorld(server)
  var nearby=fdActiveSectors(server,level)
  if (fdCombatTick - fdEntityScanTick >= FD_ENTITY_SCAN_INTERVAL) {
    fdTrackedRobots = []
    fdTrackedSem = []
    fdSettlementCivilians = {}
    var iterator = level.getAllEntities().iterator()
    fwScanBegin()
    while (iterator.hasNext()) {
      var scannedEntity = iterator.next()
      if (!scannedEntity.isAlive()) continue
      fwScanEntity(scannedEntity)
      if (fdIsCivilianEntity(scannedEntity)) {
        var civilianKey=fdMajorKey(fdSX(scannedEntity.x),fdSZ(scannedEntity.z))
        fdSettlementCivilians[civilianKey]=Number(fdSettlementCivilians[civilianKey] || 0)+1
      }
      if (fdIsRobot(scannedEntity) && scannedEntity.getTags().contains('fd_robot')) fdTrackedRobots.push(scannedEntity)
      else if (fdEntityId(scannedEntity).indexOf('simpleenemymod:') === 0) fdTrackedSem.push(scannedEntity)
    }
    fwScanEnd(server)
    fdEntityScanTick = fdCombatTick
    if (fdCombatCursor >= fdTrackedRobots.length) fdCombatCursor = 0
  }

  var robots = fdTrackedRobots
  var semSoldiers = fdTrackedSem
  if (robots.length === 0) return
  var batch = Math.min(FD_AI_BATCH, robots.length)

  // Player detection belongs entirely to Stealth. We only relay a target that
  // Warium's own AI has already acquired. This preserves light, crouching,
  // movement, grass, FOV, vibration and TaCZ-Stealth bridge behavior.
  for (var r = 0; r < batch; r++) {
    var robot = robots[(fdCombatCursor + r) % robots.length]
    if (!robot || !robot.isAlive()) continue
    if(!nearby[fdKey(fdSX(robot.x),fdSZ(robot.z))])continue
    fwRiverSlow(robot,level)
    var acquiredTarget = null
    try { acquiredTarget = robot.getTarget() } catch (ignored) {}
    if (acquiredTarget != null && acquiredTarget.isAlive() && fdIsDefenderEntity(acquiredTarget)) {
      fdRememberTarget(acquiredTarget)
      continue
    }

    // SEM units are not players, so Stealth does not expose a player-visibility
    // value for them. Require close range and a real line of sight.
    var nearestSem = null
    var nearestSemDistance = FD_SEM_DETECTION_RANGE_SQ
    for (var d = 0; d < semSoldiers.length; d++) {
      var semDistance = fdDistanceSq(robot, semSoldiers[d])
      if (semDistance < nearestSemDistance && fdHasLineOfSight(robot, semSoldiers[d])) {
        nearestSemDistance = semDistance
        nearestSem = semSoldiers[d]
      }
    }
    if (nearestSem != null) {
      try { robot.setTarget(nearestSem) } catch (ignored) {}
      fdRememberTarget(nearestSem)
    }
  }

  if (fdSharedIntel != null && fdSharedIntel.expires < fdCombatTick) fdSharedIntel = null

  // Unengaged robots respond to shared intel, otherwise they advance one sector.
  for (var a = 0; a < batch; a++) {
    var movingRobot = robots[(fdCombatCursor + a) % robots.length]
    if (!movingRobot || !movingRobot.isAlive()) continue
    if(!nearby[fdKey(fdSX(movingRobot.x),fdSZ(movingRobot.z))])continue
    var currentTarget = null
    try { currentTarget = movingRobot.getTarget() } catch (ignored) {}
    if (currentTarget != null && currentTarget.isAlive()) continue

    if (fdSharedIntel != null) {
      try {
        // Radio only supplies an approximate search area. Each robot must then
        // acquire the player through its own AI, where Stealth remains active.
        movingRobot.getNavigation().moveTo(fdSharedIntel.x, fdSharedIntel.y, fdSharedIntel.z, 1.15)
      } catch (ignored) {}
      continue
    }

    var destination = fdAdvanceDestination(level, movingRobot)
    if (destination != null) {
      try { movingRobot.getNavigation().moveTo(destination.x, destination.y, destination.z, 1.0) } catch (ignored) {}
    }
  }
  fdCombatCursor = (fdCombatCursor + batch) % robots.length
}

function fdLoadedSurface(level, x, z) {
  var probe = new FD_BlockPos(x, 64, z)
  if (!level.getChunkSource().hasChunk(x >> 4, z >> 4)) return null

  var y = level.getHeight(FD_Heightmap.MOTION_BLOCKING_NO_LEAVES, x, z)
  if (y <= Number(fdConfig.minimumSurfaceY) || y >= Number(fdConfig.maximumSurfaceY)) return null

  var floorPos = new FD_BlockPos(x, y - 1, z)
  var feetPos = new FD_BlockPos(x, y, z)
  var headPos = new FD_BlockPos(x, y + 1, z)

  // No invasion spawns inside caves, dungeons, bunkers or covered rooms.
  if (!level.canSeeSky(feetPos)) return null

  var floor = level.getBlockState(floorPos)
  var feet = level.getBlockState(feetPos)
  var head = level.getBlockState(headPos)

  if (!floor.getFluidState().isEmpty()) return null
  if (!feet.isAir() || !head.isAir()) return null
  var floorId = String(floor.block.id)
  if (floorId.indexOf('leaves') >= 0 || floorId.indexOf('ice') >= 0) return null
  return y
}

function fdIsCitySector(level, sx, sz) {
  var key = fdKey(sx, sz)
  if (fdCityCache[key] != null) return fdCityCache[key]

  try {
    var citySectorSize = fdZoneSize()
    var startX = sx * citySectorSize
    var startZ = sz * citySectorSize
    var samples = [
      [startX + citySectorSize / 2, startZ + citySectorSize / 2],
      [startX + citySectorSize / 4, startZ + citySectorSize / 4],
      [startX + citySectorSize * 3 / 4, startZ + citySectorSize / 4],
      [startX + citySectorSize / 4, startZ + citySectorSize * 3 / 4],
      [startX + citySectorSize * 3 / 4, startZ + citySectorSize * 3 / 4]
    ]
    var info = FD_LostCities.lostCitiesImp.getLostInfo(level)
    var cityHits = 0
    for (var i = 0; i < samples.length; i++) {
      var cx = Math.floor(samples[i][0]) >> 4
      var cz = Math.floor(samples[i][1]) >> 4
      if (!level.getChunkSource().hasChunk(cx, cz)) continue
      if (info.getChunkInfo(cx, cz).isCity()) cityHits++
    }
    fdCityCache[key] = cityHits >= fdOptionNumber('citySamplesRequired', 2)
  } catch (error) {
    console.warn('[Front Director v3.3] Lost Cities check failed for ' + key + ': ' + error)
    fdCityCache[key] = false
  }
  return fdCityCache[key]
}

function fdIsSettlementSector(level,sx,sz) {
  if(fdIsCitySector(level,sx,sz))return true
  return Number(fdSettlementCivilians[fdMajorKey(sx,sz)] || 0)>=fdOptionNumber('settlementCivilianMinimum',3)
}

function fdSpawnRobot(server, level, sx, sz, anchor, forcedType) {
  if(forcedType==='crusty_chunks:mortarer' && fwMissionEffect(server,fdKey(sx,sz),'mortar')) forcedType=fdInfantryType()
  if (fdSectorTerrain(level, sx, sz).ocean) return false
    var size = fdZoneSize()
    var margin = Math.min(20,Math.max(1,Math.floor(size/4)))
  for (var attempt = 0; attempt < Number(fdConfig.surfaceAttempts); attempt++) {
    var x
    var z
    if (anchor) {
      var radius = fdOptionNumber('squadRadius', 10)
      x = anchor.x + Math.floor(Math.random() * (radius * 2 + 1)) - radius
      z = anchor.z + Math.floor(Math.random() * (radius * 2 + 1)) - radius
      x = Math.max(sx * size + margin, Math.min((sx + 1) * size - margin - 1, x))
      z = Math.max(sz * size + margin, Math.min((sz + 1) * size - margin - 1, z))
    } else {
      x = sx * size + margin + Math.floor(Math.random() * (size - margin * 2))
      z = sz * size + margin + Math.floor(Math.random() * (size - margin * 2))
    }
    if (fdInSafeZone(x, z)) continue
    var y = fdLoadedSurface(level, x, z)
    if (y == null) continue

    var types = fdConfig.robotEntities
    var type = forcedType || String(types[Math.floor(Math.random() * types.length)])
    var spawnY = fdIsAircraftType(type) ? y + fdOptionNumber('aircraftSpawnHeight', 28) : y
    fdCmd(server, `execute in minecraft:overworld run summon ${type} ${x} ${spawnY} ${z} {Tags:["fd_robot","fd_front_unit"],PersistenceRequired:1b}`)
    return { x: x, z: z }
  }
  return null
}

function fdActiveSectors(server, level) {
  var active = {}
  var radius = Number(fdConfig.activeRadiusSectors)
  var players = level.players

  for (var p = 0; p < players.size(); p++) {
    var player = players.get(p)
    var psx = fdSX(player.x)
    var psz = fdSZ(player.z)
    for (var dx = -radius; dx <= radius; dx++) {
      for (var dz = -radius; dz <= radius; dz++) {
        var sx = psx + dx
        var sz = psz + dz
        if (fdAllowedSector(sx, sz)) active[fdKey(sx, sz)] = { sx: sx, sz: sz }
      }
    }
  }
  return active
}

function fdShowPlayerStatus(server, player) {
  var sx = fdSX(player.x)
  var sz = fdSZ(player.z)
  var control = fdControl(sx, sz)
  var terrain = fdSectorTerrain(fdWorld(server), sx, sz)
  var supplied = control > 0 ? fdIsSupplied(sx, sz) : false
  var garrison = fdOps.garrisons[fdMajorKey(sx,sz)]
  var label = 'мирная территория'
  var color = 'green'

  if (fdInSafeZone(player.x, player.z)) {
    label = 'безопасная зона'
    color = 'aqua'
  } else if (!fdInWarArea(player.x, player.z)) {
    label = 'вне театра войны'
    color = 'gray'
  } else if (fdIsFrontier(sx, sz)) {
    label = 'ЛИНИЯ ФРОНТА'
    color = 'gold'
  } else if (control >= 100) {
    label = 'тыл ' + fdEnemyName(server)
    color = 'red'
  } else if (control > 0) {
    label = 'спорная территория'
    color = 'yellow'
  }

  var name = String(player.username)
  var message = JSON.stringify({
    text: '[Фронт] ' + label + ' | сектор ТрО ' + fdMajorKey(sx,sz) + ' | зона ' + fdZoneLabel(sx,sz) + ' | контроль ' + control +
      '% | ' + terrain.name + (control > 0 ? (supplied ? ' | снабжение есть' : ' | ОКРУЖЁН') : '') +
      (garrison ? ' | ТрО ' + garrison.strength + '/' + garrison.maxStrength : ''),
    color: color
  })
  fdCmd(server, 'tellraw ' + name + ' ' + message)
}

function fdStatusCommand(context) {
  var source = context.source
  var player = source.player
  if (player == null) return 0
  if (!fdInitialized && !fdInitialize(source.server)) return 0
  fdShowPlayerStatus(source.server, player)
  return 1
}

function fdTellPlayer(server, player, text, color) {
  var message = JSON.stringify({text: '[Фронт] ' + text, color: color || 'gold'})
  fdCmd(server, 'tellraw ' + String(player.username) + ' ' + message)
}

function fdEnemyName(server) {
  var name = String(server.persistentData.getString('front_enemy_name'))
  return name.length >= 3 ? name : 'Legion'
}

// Read-only bridge for the CC tactical map. No war-management authority is exposed.
global.frontMapBuild = function(server) {
  if (!fdInitialized && !fdInitialize(server)) return null
  fdRefreshMapConfig(server)
  function rectangles(source) {
    var result = []
    for (var i=0;i<source.length;i++) result.push({name:String(source[i].name || ''),
      x1:Number(source[i].x1),z1:Number(source[i].z1),x2:Number(source[i].x2),z2:Number(source[i].z2)})
    return result
  }
  var origins=[]
  for(var i=0;i<fdConfig.origins.length;i++) origins.push({name:String(fdConfig.origins[i].name || ''),
    x:Number(fdConfig.origins[i].x),z:Number(fdConfig.origins[i].z)})
  return JSON.stringify({version: 1, sector_size: fdZoneSize(),major_sector_size:Number(fdConfig.sectorSize),
    enemy: fdEnemyName(server), areas: rectangles(fdConfig.warAreas), safe_zones: rectangles(fdConfig.safeZones),
    origins: origins, controls: fdState, garrisons: fdOps.garrisons})
}

function fdStateName(player) {
  try {
    var saved = String(player.persistentData.getString('front_state_name'))
    if (saved.length >= 3) return saved
  } catch (ignored) {}
  return String(fdConfig.defaultStateName || 'Новое государство')
}

function fdSetStateName(player, rawName) {
  var name = String(rawName || '').replace(/[\x00-\x1F\x7F§]/g, '').trim()
  if (name.length < 3 || name.length > 32) return false
  player.persistentData.putString('front_state_name', name)
  return true
}

function fdScoreAdd(server, player, objective, amount) {
  fdCmd(server, 'scoreboard players add ' + String(player.username) + ' ' + objective + ' ' + Math.max(0, Math.floor(Number(amount))))
}

function fdCostItemCount(cost, wantedItem) {
  var result = 0
  try {
    var iterator = cost.entrySet().iterator()
    while (iterator.hasNext()) {
      var entry = iterator.next()
      if (String(entry.getKey()) === wantedItem) result += Number(entry.getValue())
    }
  } catch (ignored) {
    try { result = Number(cost[wantedItem] || 0) } catch (ignoredAgain) {}
  }
  return result
}

function fdMapGet(map, key) {
  if (map == null) return null
  try { return map.get(String(key)) } catch (ignored) {}
  try { return map[String(key)] } catch (ignored) {}
  return null
}

function fdCostFor(kind, level) {
  var table = fdConfig.economy ? fdMapGet(fdConfig.economy, kind) : null
  var configured = fdMapGet(table, String(level))
  if (configured != null) return configured
  if (kind === 'garrison') {
    if (level === 1) return {'minecraft:emerald': 8, 'minecraft:iron_ingot': 16}
    if (level === 2) return {'minecraft:emerald': 12, 'minecraft:iron_ingot': 24}
    return {'minecraft:emerald': 16, 'minecraft:iron_ingot': 32}
  }
  return {'minecraft:emerald': 16, 'minecraft:iron_ingot': 24}
}

function fdPay(server, player, cost) {
  var name = String(player.username)
  var entries = []
  try {
    var iterator = cost.entrySet().iterator()
    while (iterator.hasNext()) {
      var entry = iterator.next()
      entries.push({item: String(entry.getKey()), count: Number(entry.getValue())})
    }
  } catch (ignored) {
    var keys = Object.keys(cost)
    for (var k = 0; k < keys.length; k++) entries.push({item: keys[k], count: Number(cost[keys[k]])})
  }
  for (var i = 0; i < entries.length; i++) {
    if (fdCmd(server, 'clear ' + name + ' ' + entries[i].item + ' 0') < entries[i].count) return false
  }
  for (var j = 0; j < entries.length; j++) {
    fdCmd(server, 'clear ' + name + ' ' + entries[j].item + ' ' + entries[j].count)
  }
  return true
}

function fdSpawnFriendlySquad(server, player, type, count, tag) {
  var offsets = [[2,0],[-2,0],[0,2],[0,-2],[3,3],[-3,-3]]
  for (var i = 0; i < count; i++) {
    var off = offsets[i % offsets.length]
    fdCmd(server, `execute at ${String(player.username)} run summon ${type} ~${off[0]} ~ ~${off[1]} {Tags:["${tag}"],PersistenceRequired:1b}`)
  }
}

function fdGarrisonCommand(context, mode) {
  var source = context.source
  var player = source.player
  if (player == null) return 0
  var server = source.server
  if (!fdInitialized && !fdInitialize(server)) return 0
  var sx = fdMajorX(player.x)
  var sz = fdMajorZ(player.z)
  var key = fdKey(sx, sz)
  var existing = fdOps.garrisons[key]

  if (mode === 'status') {
    if (!existing) fdTellPlayer(server, player, 'В секторе нет ТрО.', 'gray')
    else fdTellPlayer(server, player, 'ТрО сектора ' + key + ': уровень ' + existing.level + ', бойцов ' + existing.strength + '/' + existing.maxStrength + '.', 'blue')
    return 1
  }
  if (!fdInWarArea(player.x, player.z) || fdInSafeZone(player.x, player.z) || fdControl(fdSX(player.x),fdSZ(player.z)) > 0) {
    fdTellPlayer(server, player, 'ТрО можно разместить только в свободном секторе театра войны.', 'red')
    return 0
  }
  var newLevel = existing ? Number(existing.level) + 1 : 1
  if (mode === 'deploy' && existing) {
    fdTellPlayer(server, player, 'ТрО уже размещена. Используй /front garrison upgrade.', 'yellow')
    return 0
  }
  if (mode === 'upgrade' && !existing) {
    fdTellPlayer(server, player, 'Сначала используй /front garrison.', 'yellow')
    return 0
  }
  if (newLevel > 3) {
    fdTellPlayer(server, player, 'ТрО уже максимального уровня.', 'yellow')
    return 0
  }
  if (!fdPay(server, player, fdCostFor('garrison', newLevel))) {
    fdTellPlayer(server, player, 'Недостаточно ресурсов для уровня ' + newLevel + '.', 'red')
    return 0
  }
  var targetSize = newLevel === 1 ? 3 : (newLevel === 2 ? 4 : 5)
  var oldSize = existing ? Number(existing.strength) : 0
  var add = Math.max(0, targetSize - oldSize)
  var sectorTag = 'fd_garrison_' + sx + '_' + sz
  fdSpawnFriendlySquad(server, player, fdConfig.garrisonEntity || 'simpleenemymod:usunit', add, sectorTag)
  fdOps.garrisons[key] = {level: newLevel, strength: targetSize, maxStrength: targetSize, stateName: fdStateName(player)}
  fdOpsDirty = true
  fdOpsSave(server)
  fdScoreAdd(server, player, 'front_garrison', 1)
  fdScoreAdd(server, player, 'front_supplies', fdCostItemCount(fdCostFor('garrison', newLevel), 'kubejs:military_supply_crate'))
  fdTellPlayer(server, player, 'ТрО государства «' + fdStateName(player) + '» развёрнута: уровень ' + newLevel + ', бойцов ' + targetSize + '.', 'blue')
  return 1
}

function fdHqPayload(server, player) {
  var sx = fdSX(player.x)
  var sz = fdSZ(player.z)
  var control = fdControl(sx, sz)
  var key = fdMajorKey(sx, sz)
  var terrain = fdSectorTerrain(fdWorld(server), sx, sz)
  var garrison = fdOps.garrisons[key]
  var zone = !fdInWarArea(player.x, player.z) ? 'Вне театра войны' :
    (fdInSafeZone(player.x, player.z) ? 'Безопасная зона' :
      (fdIsFrontier(sx, sz) ? 'Линия фронта' : (control > 0 ? 'Территория Warium' : 'Свободный сектор')))
  return {
    role: String(player.persistentData.getString('front_rp_role') || ''),
    warPaused:server.persistentData.getBoolean('front_gm_paused'),
    warPace:fdWarPace(server),
    callsign: String(player.persistentData.getString('front_rp_callsign') || ''),
    flag: String(player.persistentData.getString('front_rp_flag') || ''),
    enemyName: fdEnemyName(server), language: String(player.persistentData.getString('front_language') || 'ru'),
    canEdit: fcCanEdit(player),
    zoneCode: !fdInWarArea(player.x, player.z) ? 'outside' : (fdInSafeZone(player.x, player.z) ? 'safe' : (fdIsFrontier(sx, sz) ? 'front' : (control > 0 ? 'enemy' : 'free'))),
    stateName: fdStateName(player), sector: key+' / '+fdZoneLabel(sx,sz),control: Math.round(control), zone: zone,
    tacticalZone:fdKey(sx,sz),majorSector:key,
    terrain: terrain.name, supplied: control > 0 ? fdIsSupplied(sx, sz) : true,
    garrisonLevel: garrison ? Number(garrison.level) : 0,
    garrisonStrength: garrison ? Number(garrison.strength) : 0,
    garrisonMax: garrison ? Number(garrison.maxStrength) : 0
  }
}

// Persistent GM pacing changes strategic expansion only. Combat AI, spawning,
// casualties and player counterattacks continue at their normal rate.
function fdWarPace(server) {
  if(!server.persistentData.getBoolean('front_pace_initialized')) {
    server.persistentData.putBoolean('front_pace_initialized',true)
    server.persistentData.putInt('front_war_pace',100)
  }
  var pace=Number(server.persistentData.getInt('front_war_pace'))
  return [0,35,100,200,400].indexOf(pace)>=0?pace:100
}
function fdSetWarPace(server,pace) {
  server.persistentData.putBoolean('front_pace_initialized',true)
  server.persistentData.putInt('front_war_pace',Number(pace))
}

function fdOpenHq(server, player) {
  if (!fdInitialized && !fdInitialize(server)) return 0
  player.sendData('front:hq_data', fdHqPayload(server, player))
  return 1
}

function fdXaeroWaypoint(server, player, name, symbol, x, y, z, color) {
  // Xaero's client recognises this shared-waypoint payload and adds its own
  // clickable [Add] control. TMP marks operational points that may become stale.
  var safeName = String(name).replace(/[:\r\n]/g, '_').replace(/ /g, '_')
  var payload = 'xaero-waypoint:' + safeName + ':' + symbol + ':' +
    Math.floor(x) + ':' + Math.floor(y) + ':' + Math.floor(z) + ':' +
    Math.floor(color) + ':false:0:Internal-overworld-waypoints'
  fdCmd(server, 'tellraw ' + String(player.username) + ' ' + JSON.stringify({text: payload}))
}

function fdFrontMapCommand(context) {
  var player = context.source.player
  if (player == null) return 0
  var server = context.source.server
  if (!fdInitialized && !fdInitialize(server)) return 0

  var candidates = []
  Object.keys(fdState).forEach(key => {
    var pair = key.split(',')
    var sx = Number(pair[0])
    var sz = Number(pair[1])
    if (!fdIsFrontier(sx, sz)) return
    var center = fdSectorCenter(sx, sz)
    var dx = center.x - player.x
    var dz = center.z - player.z
    candidates.push({
      sx: sx, sz: sz, x: center.x, z: center.z,
      distanceSq: dx * dx + dz * dz,
      supplied: fdIsSupplied(sx, sz)
    })
  })
  candidates.sort((a, b) => a.distanceSq - b.distanceSq)

  if (candidates.length === 0) {
    fdTellPlayer(server, player, 'Активная линия фронта пока не обнаружена.', 'gray')
    return 0
  }

  var amount = Math.min(5, candidates.length)
  fdTellPlayer(server, player, 'Ближайшие участки фронта: ' + amount + '. Нажми [Add] в сообщениях Xaero. Метки TMP временные.', 'gold')
  for (var i = 0; i < amount; i++) {
    var point = candidates[i]
    var distance = Math.round(Math.sqrt(point.distanceSq))
    var color = point.supplied ? 6 : 5 // gold / dark purple
    var label = point.supplied ? 'TMP_FRONT' : 'TMP_ENCIRCLED'
    fdXaeroWaypoint(server, player,
      label + '_' + point.sx + '_' + point.sz + '_' + distance + 'm',
      point.supplied ? 'F' : 'O', point.x, 90, point.z, color)
  }

  // Strategic reference points use stable colours: red enemy origin,
  // green nearest garrison, aqua nearest configured safe base.
  if (fdConfig.origins && fdConfig.origins.length > 0) {
    var origin = fdConfig.origins[0]
    fdXaeroWaypoint(server, player, 'TMP_' + fdEnemyName(server) + '_ORIGIN', 'W', origin.x, 90, origin.z, 4)
  }

  var nearestGarrison = null
  Object.keys(fdOps.garrisons).forEach(key => {
    var pair = key.split(',')
    var center = fdMajorCenter(Number(pair[0]), Number(pair[1]))
    var dx = center.x - player.x
    var dz = center.z - player.z
    var distanceSq = dx * dx + dz * dz
    if (nearestGarrison == null || distanceSq < nearestGarrison.distanceSq) {
      nearestGarrison = {x: center.x, z: center.z, distanceSq: distanceSq}
    }
  })
  if (nearestGarrison != null) {
    fdXaeroWaypoint(server, player, 'TMP_NEAREST_GARRISON', 'G', nearestGarrison.x, 90, nearestGarrison.z, 10)
  }

  var nearestBase = null
  for (var b = 0; b < fdConfig.safeZones.length; b++) {
    var rect = fdConfig.safeZones[b]
    var bx = Math.floor((Number(rect.x1) + Number(rect.x2)) / 2)
    var bz = Math.floor((Number(rect.z1) + Number(rect.z2)) / 2)
    var bdx = bx - player.x
    var bdz = bz - player.z
    var baseDistanceSq = bdx * bdx + bdz * bdz
    if (nearestBase == null || baseDistanceSq < nearestBase.distanceSq) {
      nearestBase = {x: bx, z: bz, distanceSq: baseDistanceSq}
    }
  }
  if (nearestBase != null) fdXaeroWaypoint(server, player, 'TMP_SAFE_BASE', 'B', nearestBase.x, 90, nearestBase.z, 11)
  return amount
}

NetworkEvents.dataReceived('front:hq_request', event => {
  var player = event.player
  var server = player.server
  if (!fdInitialized && !fdInitialize(server)) return
  var action = String(event.data.action || 'refresh')
  if (action === 'enemy_name' && fcCanEdit(player)) {
    var enemyName = String(event.data.name || '').replace(/[\x00-\x1F\x7F§:]/g, '').trim()
    if (enemyName.length >= 3 && enemyName.length <= 32) server.persistentData.putString('front_enemy_name', enemyName)
  }
  if (action === 'language') {
    var selectedLanguage = String(event.data.language)
    if (selectedLanguage === 'ru' || selectedLanguage === 'uk' || selectedLanguage === 'en') player.persistentData.putString('front_language', selectedLanguage)
  }
  if (action === 'map') fdFrontMapCommand({source: {player: player, server: server}})
  if (action === 'garrison') fdCmd(server, 'execute as ' + String(player.username) + ' run front garrison')
  else if (action === 'upgrade') fdCmd(server, 'execute as ' + String(player.username) + ' run front garrison upgrade')
  else if (action === 'state_name') {
    if (fdSetStateName(player, event.data.name)) fdTellPlayer(server, player, 'Название государства изменено на «' + fdStateName(player) + '».', 'green')
    else fdTellPlayer(server, player, 'Название должно содержать от 3 до 32 символов.', 'red')
  }
  fdOpenHq(server, player)
})

function fdPurgeCommand(context) {
  var source = context.source
  var removed = fdCmd(source.server, 'kill @e[tag=fd_robot]')
  fdTrackedRobots = []
  if (source.player != null) fdTellPlayer(source.server, source.player, 'Удалено фронтовых роботов: ' + removed + '. Контроль территорий сохранён.', 'green')
  return 1
}

function fdHasWarServiceTag(entity) {
  try {
    var iterator = entity.getTags().iterator()
    while (iterator.hasNext()) {
      var tag = String(iterator.next())
      if (tag === 'fd_robot' || tag.indexOf('fd_garrison_') === 0) return true
    }
  } catch (ignored) {}
  return false
}

function fdResetWar(context) {
  var source = context.source
  var server = source.server
  if (!fdInitialized && !fdInitialize(server)) return 0
  var level = fdWorld(server)
  var removed = 0
  var iterator = level.getAllEntities().iterator()
  while (iterator.hasNext()) {
    var entity = iterator.next()
    if (!fdIsRobot(entity) && !fdHasWarServiceTag(entity)) continue
    try {
      entity.discard()
      removed++
    } catch (error) {
      try {
        entity.remove('discarded')
        removed++
      } catch (ignored) {}
    }
  }

  fdState = {}
  fdDirty = true
  for (var i = 0; i < fdConfig.origins.length; i++) {
    fdSetControl(fdSX(fdConfig.origins[i].x), fdSZ(fdConfig.origins[i].z), 100)
  }
  fdOps = { liberated: {}, protection: {}, garrisons: {}, alerts: {} }
  fwLoad(server)
  fwData={mail:[],defence:{},missions:{},effects:{},cooldowns:{}}
  fwSave(server)
  fdOpsDirty = true
  fdTrackedRobots = []
  fdTrackedSem = []
  fdSettlementCivilians = {}
  fdCombatCursor = 0
  fdEntityScanTick = fdCombatTick
  fdSharedIntel = null
  fdTerrainCache = {}
  fdCityCache = {}
  fdExpansionClock = Number(fdConfig.expansionIntervalMinutes) * 60 * 20
  fdRebuildSupply()
  fdSave(server)
  fdOpsSave(server)

  fdTell(server, 'Война полностью сброшена. Убрано сущностей: ' + removed + '. Экспансия снова начинается от исходного очага.', 'yellow')
  return 1
}

function fdResetWarning(context) {
  if (context.source.player != null) {
    fdTellPlayer(context.source.server, context.source.player,
      'Полный сброс удалит роботов и ТрО, а также очистит контроль секторов. Для подтверждения: /front reset confirm', 'red')
  }
  return 1
}

ServerEvents.commandRegistry(event => {
  var Commands = event.commands
  event.register(
    Commands.literal('front')
      .executes(context => fdStatusCommand(context))
      .then(Commands.literal('status').executes(context => fdStatusCommand(context)))
      .then(Commands.literal('hq').executes(context => {
        return context.source.player == null ? 0 : fdOpenHq(context.source.server, context.source.player)
      }))
      .then(Commands.literal('map').executes(context => fdFrontMapCommand(context)))
      .then(Commands.literal('garrison')
        .executes(context => fdGarrisonCommand(context, 'deploy'))
        .then(Commands.literal('upgrade').executes(context => fdGarrisonCommand(context, 'upgrade')))
        .then(Commands.literal('status').executes(context => fdGarrisonCommand(context, 'status'))))
      .then(Commands.literal('purge')
        .requires(source => source.hasPermission(2))
        .executes(context => fdPurgeCommand(context)))
      .then(Commands.literal('reset')
        .requires(source => source.hasPermission(2))
        .executes(context => fdResetWarning(context))
        .then(Commands.literal('confirm').executes(context => fdResetWar(context))))
  )
})

function fdUpdateLocalFront(server) {
  var level = fdWorld(server)
  var active = fdActiveSectors(server, level)
  var parentCounts={}

  Object.keys(active).forEach(key => {
    var activeSector = active[key]
    var parentKey=fdMajorKey(activeSector.sx,activeSector.sz)
    var parentPair=parentKey.split(','),majorSize=Number(fdConfig.sectorSize)
    if(parentCounts[parentKey]==null) {
      parentCounts[parentKey]=fdCount(server,`@e[tag=fd_robot,x=${Number(parentPair[0])*majorSize},y=-64,z=${Number(parentPair[1])*majorSize},dx=${majorSize-1},dy=384,dz=${majorSize-1}]`)
    }
    var control = fdControl(activeSector.sx, activeSector.sz)
    var frontSector = fdIsFrontier(activeSector.sx, activeSector.sz)
    if (!frontSector && control < Number(fdConfig.spawnControlMinimum)) return

    var robots = fdCount(server, fdRobotSelector(activeSector.sx, activeSector.sz))
    var defenders = fdDefenderCount(server, activeSector.sx, activeSector.sz)

    if (defenders > 0 && robots === 0 && control > 0) {
      var recovery = Number(fdConfig.defenderRecoveryPerCheck) * Math.min(defenders, Number(fdConfig.resistanceCap))
      fdSetControl(activeSector.sx, activeSector.sz, control - recovery)
    } else if (defenders === 0 && control > 0 && fdNeighborHasControl(activeSector.sx, activeSector.sz, Number(fdConfig.expansionSourceControl))) {
      fdSetControl(activeSector.sx, activeSector.sz, control + Number(fdConfig.unopposedGainPerCheck))
    }

    var updated = fdControl(activeSector.sx, activeSector.sz)
    if (updated < Number(fdConfig.spawnControlMinimum)) return

    var strength = fdStrength(activeSector.sx, activeSector.sz)
    var citySector = fdIsCitySector(level, activeSector.sx, activeSector.sz)
    var settlementSector = citySector || fdIsSettlementSector(level, activeSector.sx, activeSector.sz)
    var mortarSuppressed = fwMissionEffect(server, fdKey(activeSector.sx,activeSector.sz), 'mortar')
    var requiredMortars = frontSector && settlementSector && !mortarSuppressed ? Math.floor(fdOptionNumber('siegeMortarMinimum',1)) : 0
    var mortarCount = requiredMortars > 0 ? fdCount(server,`@e[type=crusty_chunks:mortarer,tag=fd_robot,x=${Number(parentPair[0])*majorSize},y=-64,z=${Number(parentPair[1])*majorSize},dx=${majorSize-1},dy=384,dz=${majorSize-1}]`) : 0
    var missingSiegeMortars = Math.max(0,requiredMortars-mortarCount)
    var cityMultiplier = citySector ? fdOptionNumber('cityRobotMultiplier', 1.8) : 1.0
    var resistanceBonus = Math.min(Number(fdConfig.resistanceCap), defenders) * Number(fdConfig.extraRobotsPerDefender)
    var frontBaseCap = fdOptionNumber('frontRobotCapPerSector', fdConfig.baseRobotCapPerSector)
    var rearBaseCap = fdOptionNumber('rearGarrisonCapPerSector', 8)
    var selectedBaseCap = frontSector ? frontBaseCap : rearBaseCap
    var absoluteCap=Number(fdConfig.absoluteRobotCapPerSector)
    var cap = Math.min(absoluteCap+missingSiegeMortars,
      Math.round(selectedBaseCap * strength * cityMultiplier + (frontSector ? resistanceBonus : 0)))
    if(missingSiegeMortars>0)cap=Math.max(cap,Math.min(robots+missingSiegeMortars,absoluteCap+missingSiegeMortars))

    if (robots >= cap) return
    var selectedBatch = frontSector ? fdOptionNumber('frontSpawnBatch', fdConfig.spawnBatch) : fdOptionNumber('rearSpawnBatch', 2)
    var wave = Math.min(selectedBatch, cap - robots,
      Math.max(0,absoluteCap+missingSiegeMortars-parentCounts[parentKey]))
    if(wave<=0) return
    var squadAnchor = null
    var rarePresent = fdCount(server, `@e[tag=fd_rare_support,${fdSectorBox(activeSector.sx, activeSector.sz)}]`) > 0
    for (var i = 0; i < wave; i++) {
      var forcedType = fdInfantryType()
      var rareSupport = false
      var guaranteedMortar=missingSiegeMortars>0
      if (guaranteedMortar) {
        forcedType = 'crusty_chunks:mortarer'
      } else if (i === 0 && wave >= fdOptionNumber('squadLeaderMinimumSize', 5) &&
          Math.random() < fdOptionNumber('squadLeaderChance', 0.35)) {
        var leaders = fdConfig.squadLeaderEntities || ['crusty_chunks:commander', 'crusty_chunks:scout']
        forcedType = String(leaders[Math.floor(Math.random() * leaders.length)])
      } else if (!rarePresent && Math.random() < fdOptionNumber('rareSupportChancePerUnit', 0.02)) {
        forcedType = fdRandomFrom(fdConfig.rareSupportEntities, 'crusty_chunks:hunter')
        rareSupport = true
        rarePresent = true
      } else if (Math.random() < fdOptionNumber('mortarChancePerUnit', 0.025)) {
        forcedType = 'crusty_chunks:mortarer'
      } else if (Math.random() < fdOptionNumber('supportChancePerUnit', 0.18)) {
        forcedType = fdSupportType()
      }
      var spawnedAt = fdSpawnRobot(server, level, activeSector.sx, activeSector.sz, squadAnchor, forcedType)
      if(spawnedAt) {
        parentCounts[parentKey]++
        if(guaranteedMortar)missingSiegeMortars--
      }
      if (rareSupport && spawnedAt) {
        fdCmd(server, `tag @e[type=${forcedType},tag=fd_robot,sort=nearest,limit=1,x=${spawnedAt.x},z=${spawnedAt.z},distance=..24] add fd_rare_support`)
      }
      if (!squadAnchor && spawnedAt) squadAnchor = spawnedAt
    }
  })
  fdSave(server)
}

function fdInitialize(server) {
  if (fdInitialized) return true
  try {
    fdLoadConfig(server)
    if (!fdConfig.enabled) return false
    fdCmd(server, 'scoreboard objectives add fd_tmp dummy')
    fdCmd(server, 'scoreboard objectives add front_sectors dummy')
    fdCmd(server, 'scoreboard objectives add front_garrison dummy')
    fdCmd(server, 'scoreboard objectives add front_supplies dummy')
    fdLoadState(server)
    fdOpsLoad(server)
    fdRebuildSupply()
    fdExpansionClock = Number(fdConfig.expansionIntervalMinutes) * 60 * 20
    fdInitialized = true
    fdTell(server, `Фронт загружен: сектор ТрО ${fdConfig.sectorSize}, зона боя ${fdZoneSize()} блоков.`, 'yellow')
    console.info('[Front Director v3.2] initialized successfully')
    return true
  } catch (error) {
    console.error('[Front Director v3.2] initialization failed: ' + error)
    fdConfig = null
    fdInitialized = false
    return false
  }
}

ServerEvents.loaded(event => {
  fdInitialize(event.server)
})

ServerEvents.tick(event => {
  // Also initializes after /reload, because ServerEvents.loaded is not fired by /reload.
  if (!fdInitialized && !fdInitialize(event.server)) return
  if (!fdConfig || !fdConfig.enabled) return
  fdTick++
  if(event.server.persistentData.getBoolean('front_gm_paused'))return
  fdCombatTick++
  if (fdCombatTick % FD_AI_INTERVAL === 0) fdCombatNetwork(event.server)
  if (fdTick % FD_CHECK_TICKS !== 0) return

  var server = event.server
  // 0% freezes strategic borders without freezing battles. Other presets
  // consume the expansion clock proportionally and persist with the world.
  fdExpansionClock -= FD_CHECK_TICKS * fdWarPace(event.server) / 100
  if (fdExpansionClock <= 0) {
    fdStrategicExpansion(server)
    fdExpansionClock = Number(fdConfig.expansionIntervalMinutes) * 60 * 20
  }
  fdUpdateLocalFront(server)
})

EntityEvents.death(event => {
  if(fdInitialized) fwEntityDeath(event)
  if (!fdConfig || !fdConfig.enabled || !fdIsRobot(event.entity)) return
  var entity = event.entity
  var sx = fdSX(entity.x)
  var sz = fdSZ(entity.z)
  if (!fdAllowedSector(sx, sz)) return

  var player = event.source && event.source.player ? event.source.player : null
  var loss = Number(fdConfig.controlLossPerRobotKill)
  if (player != null) loss *= Number(fdConfig.playerKillMultiplier)
  var oldControl = fdControl(sx, sz)
  fdSetControl(sx, sz, oldControl - loss)

  // Player liberation is intentionally asymmetric: Warium capturing a sector
  // never deletes players, allied soldiers or civilians.
  if (player != null && oldControl > 0 && fdControl(sx, sz) === 0) {
    fdLiberateSector(event.server, sx, sz, player)
    fdSave(event.server)
    fdOpsSave(event.server)
  }
})

// Warium has its own spawning mechanisms which do not know about the front map.
// Only units marked by fdSpawnRobot are allowed to join through this director.
EntityEvents.spawned(event => {
  if (!fdConfig || !fdConfig.enabled) return
  var entity = event.entity
  var id = fdEntityId(entity)
  if (id.indexOf('simpleenemymod:') === 0) {
    fdTrackedSem.push(entity)
    return
  }
  if (!fdIsRobot(entity)) return
  if (!entity.getTags().contains('fd_robot')) {
    event.cancel()
    return
  }
  fdTrackedRobots.push(entity)
})
// Front v9 services. No chunk loading, no allied entity respawning.
var fwData=null, fwScan={}, fwStoreKey=''
var FW_Effect=Java.loadClass('net.minecraft.world.effect.MobEffectInstance')
var FW_Effects=Java.loadClass('net.minecraft.world.effect.MobEffects')
function fwRiverSlow(robot,level) {
  if(fdIsAircraftType(fdEntityId(robot)))return
  try {
    if(robot.isInWater() && fdBiomeIdAtLoaded(level,Math.floor(robot.x),Math.floor(robot.z)).indexOf('river')>=0)
      robot.addEffect(new FW_Effect(FW_Effects.MOVEMENT_SLOWDOWN,FD_AI_INTERVAL+40,2,false,false))
  } catch(ignored){}
}
function fwLoad(server) {
  var storage='front_services_v9_'+fdZoneSize()
  if(fwData && fwStoreKey===storage) return
  fwStoreKey=storage
  try { fwData=JSON.parse(String(server.persistentData.getString(storage)) || '{}') } catch(ignored) { fwData={} }
  if(!fwData.mail)fwData.mail=[]
  if(!fwData.defence)fwData.defence={}
  if(!fwData.missions)fwData.missions={}
  if(!fwData.effects)fwData.effects={}
  if(!fwData.cooldowns)fwData.cooldowns={}
}
function fwSave(server) { server.persistentData.putString(fwStoreKey,JSON.stringify(fwData)) }
function fwMail(server,zone,kind) {
  fwLoad(server)
  var now=fdGameTime(server)
  for(var i=fwData.mail.length-1;i>=0;i--) {
    var m=fwData.mail[i]
    if(m.zone===zone && m.kind===kind && now-m.tick<1200) {m.count++;fwSave(server);return}
  }
  fwData.mail.push({id:String(now)+'_'+fwData.mail.length,zone:zone,kind:kind,tick:now,count:1})
  while(fwData.mail.length>100)fwData.mail.shift()
  fwSave(server)
}
function fwScanBegin() { fwScan={} }
function fwScanEntity(entity) {
  var id=fdEntityId(entity), soldier=false, vehicle=false
  for(var i=0;i<fdConfig.alliedEntities.length;i++)if(id===String(fdConfig.alliedEntities[i]))soldier=true
  // SBW vehicles are NOT assumed friendly. Owner/crew must be identified manually by a tag.
  try {vehicle=id.indexOf('superbwarfare:')===0 && entity.getTags().contains('front_friendly_vehicle')}catch(ignored){}
  if(!soldier && !vehicle)return
  var zone=fdKey(fdSX(entity.x),fdSZ(entity.z))
  if(!fwScan[zone])fwScan[zone]={soldiers:0,vehicles:0}
  if(soldier)fwScan[zone].soldiers++
  if(vehicle)fwScan[zone].vehicles++
}
function fwScanEnd(server) {
  fwLoad(server)
  var active=fdActiveSectors(server,fdWorld(server)), now=fdGameTime(server)
  Object.keys(active).forEach(key=>{
    var p=active[key],size=fdZoneSize(), level=fdWorld(server)
    // Do not replace a remembered garrison with a partial loaded-entity census.
    var complete=true
    for(var cx=Math.floor(p.sx*size/16);cx<=Math.floor(((p.sx+1)*size-1)/16);cx++)
      for(var cz=Math.floor(p.sz*size/16);cz<=Math.floor(((p.sz+1)*size-1)/16);cz++)
        if(!level.getChunkSource().hasChunk(cx,cz))complete=false
    if(!complete)return
    var result=fwScan[key] || {soldiers:0,vehicles:0}
    result.tick=now
    result.strength=result.soldiers+result.vehicles*4
    result.sufficient=result.strength>=fdOptionNumber('rememberedDefenceMinimum',5)
    fwData.defence[key]=result
  })
  // Keep persistent census bounded. It is information, never an extra army.
  var keys=Object.keys(fwData.defence)
  if(keys.length>4096) {
    keys.sort((a,b)=>fwData.defence[a].tick-fwData.defence[b].tick)
    for(var i=0;i<keys.length-4096;i++)delete fwData.defence[keys[i]]
  }
  fwSave(server)
}
function fwMissionEffect(server,zone,kind) {
  fwLoad(server)
  return Number(fwData.effects[zone+':'+kind] || 0)>fdGameTime(server)
}
function fwCleanText(value,max) {return String(value || '').replace(/[\x00-\x1F\x7F§]/g,'').trim().slice(0,max)}
function fwPlayerKey(player) {return String(player.uuid)}
function fwMission(server,player,kind) {
  fwLoad(server)
  var owner=fwPlayerKey(player),now=fdGameTime(server)
  var current=fwData.missions[owner]
  if(current && current.expires>now)return
  if(Number(fwData.cooldowns[owner] || 0)>now)return
  var targetType={mortar:'crusty_chunks:mortarer',depot:'crusty_chunks:worker',headquarters:'crusty_chunks:commander'}[kind]
  if(!targetType)return
  var best=null,distance=512*512
  for(var i=0;i<fdTrackedRobots.length;i++) {
    var e=fdTrackedRobots[i]
    if(!e || !e.isAlive() || fdEntityId(e)!==targetType || !fdInWarArea(e.x,e.z) || fdInSafeZone(e.x,e.z))continue
    var d=fdDistanceSq(e,player)
    if(d<distance){best=e;distance=d}
  }
  if(!best) {fdTellPlayer(server,player,'Нет подходящей цели в загруженной зоне БД рядом с тобой. Новые юниты для задания не создаются.','yellow');return}
  var zone=fdKey(fdSX(best.x),fdSZ(best.z))
  fwData.missions[owner]={kind:kind,target:String(best.uuid),zone:zone,x:Math.floor(best.x),z:Math.floor(best.z),expires:now+36000}
  fwSave(server)
}
function fwEntityDeath(event) {
  fwLoad(event.server)
  var uuid=String(event.entity.uuid),now=fdGameTime(event.server)
  var changed=false
  Object.keys(fwData.missions).forEach(owner=>{
    var task=fwData.missions[owner]
    if(task.target!==uuid)return
    changed=true
    var killer=event.source && event.source.player
    if(task.expires>now && killer && fwPlayerKey(killer)===owner &&
       fdInWarArea(event.entity.x,event.entity.z) && !fdInSafeZone(event.entity.x,event.entity.z)) {
      fwData.effects[task.zone+':'+task.kind]=now+12000
      fwMail(event.server,task.zone,'mission_'+task.kind)
      fwData.cooldowns[owner]=now+12000
    }
    delete fwData.missions[owner]
  })
  if(changed)fwSave(event.server)
}
function fwSend(server,player,tab) {
  fwLoad(server)
  var owner=fwPlayerKey(player), now=fdGameTime(server),task=fwData.missions[owner]
  if(task && task.expires<=now){delete fwData.missions[owner];fwSave(server);task=null}
  var zone=fdKey(fdSX(player.x),fdSZ(player.z)), defence=fwData.defence[zone]
  var read=Number(player.persistentData.getLong('front_mail_read'))
  player.sendData('front:services_data',{tab:tab || 'mail',language:String(player.persistentData.getString('front_language') || 'ru'),
    role:String(player.persistentData.getString('front_rp_role')),callsign:String(player.persistentData.getString('front_rp_callsign')),
    flag:String(player.persistentData.getString('front_rp_flag')),state:fdStateName(player),
    mail:fwData.mail.slice(-8).reverse(),read:read,now:now,mission:task || {},
    defence:defence || {},zone:zone})
}
NetworkEvents.dataReceived('front:services_request',event=>{
  var player=event.player, server=player.server
  if(!fdInitialized && !fdInitialize(server))return
  var action=String(event.data.action || 'mail'),tab=String(event.data.tab || action)
  if(action==='profile_save') {
    player.persistentData.putString('front_rp_role',fwCleanText(event.data.role,32))
    player.persistentData.putString('front_rp_callsign',fwCleanText(event.data.callsign,32))
    player.persistentData.putString('front_rp_flag',fwCleanText(event.data.flag,12))
    tab='profile'
  }
  if(action==='read') {player.persistentData.putLong('front_mail_read',fdGameTime(server));tab='mail'}
  if(action==='mission') {fwMission(server,player,String(event.data.kind));tab='missions'}
  if(action==='cancel') {fwLoad(server);delete fwData.missions[fwPlayerKey(player)];fwSave(server);tab='missions'}
  fwSend(server,player,tab)
})
// Operator-only tools. Cosmetic ranks never grant access.
NetworkEvents.dataReceived('front:admin_request',event=>{
  var player=event.player,server=player.server
  if(!fcCanEdit(player))return
  if(!fdInitialized && !fdInitialize(server))return
  var now=fdGameTime(server)
  var action=String(event.data.action || '')
  if(typeof fuiAllow==='function' && !fuiAllow(player,'legacy_'+action))return
  if(action==='pause_toggle')server.persistentData.putBoolean('front_gm_paused',!server.persistentData.getBoolean('front_gm_paused'))
  else if(action==='control_plus' || action==='control_minus'){
    var sx=fdSX(player.x),sz=fdSZ(player.z)
    if(String(player.level.dimension)==='minecraft:overworld' && fdAllowedSector(sx,sz)){
      fdSetControl(sx,sz,fdControl(sx,sz)+(action==='control_plus'?25:-25));fdRebuildSupply();fdSave(server)
    }
  }
  else if(action==='supplies')fdCmd(server,'give '+String(player.username)+' kubejs:military_supply_crate 4')
  else if(action==='heal')player.setHealth(player.getMaxHealth())
  else if(action==='purge')fdPurgeCommand({source:{server:server,player:player}})
  else if(action==='reset_arm')player.persistentData.putLong('front_reset_until',now+200)
  else if(action==='reset' && Number(player.persistentData.getLong('front_reset_until'))>now){
    player.persistentData.putLong('front_reset_until',0)
    fdResetWar({source:{server:server,player:player}})
  }
  fdOpenHq(server,player)
})

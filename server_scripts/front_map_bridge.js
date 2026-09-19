// Five surface probes, one sector/second. NEVER loads or generates chunks.
var FM_Pos = Java.loadClass('net.minecraft.core.BlockPos')
var FM_Height = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types')
var FM_Registry = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
var FM_BiomeTags = Java.loadClass('net.minecraft.tags.BiomeTags')
var fmClock = 0
var FM_SURVEY_PER_SECOND = 8
var fmCells = []
var fmCursor = 0
var fmTerrain = {}
var fmLoaded = false
var FM_TERRAIN_VERSION = 3
var fmMetadata = null
var fmSignature = ''

function fmPrepare(server) {
  if (!global.frontMapBuild) return false
  var encoded = global.frontMapBuild(server)
  if (!encoded) return false
  fmMetadata = JSON.parse(String(encoded))
  if (!fmLoaded) {
    try { fmTerrain = JSON.parse(String(server.persistentData.getString('front_cc_terrain')) || '{}') } catch (fmError) { fmTerrain = {} }
    fmLoaded = true
    // Re-survey when biome classification changes.
    if(Number(server.persistentData.getInt('front_cc_terrain_version'))!==FM_TERRAIN_VERSION) fmTerrain={}
    server.persistentData.putInt('front_cc_terrain_version',FM_TERRAIN_VERSION)
  }
  var signature = JSON.stringify([fmMetadata.sector_size, fmMetadata.areas])
  if (signature !== fmSignature) {
    fmSignature = signature
    fmCells = []
    // Sector coordinates only remain valid at the same sector size.
    if (Number(server.persistentData.getInt('front_cc_sector_size')) !== Number(fmMetadata.sector_size)) fmTerrain = {}
    server.persistentData.putInt('front_cc_sector_size',Number(fmMetadata.sector_size))
    fmCursor = 0
    var size = fmMetadata.sector_size
    var seen = {}
    for (var a = 0; a < fmMetadata.areas.length; a++) {
      var area = fmMetadata.areas[a]
      for (var sx = Math.floor(Math.min(area.x1,area.x2)/size); sx <= Math.floor(Math.max(area.x1,area.x2)/size); sx++) {
        for (var sz = Math.floor(Math.min(area.z1,area.z2)/size); sz <= Math.floor(Math.max(area.z1,area.z2)/size); sz++) {
          var key = sx+','+sz
          if (seen[key]) continue
          seen[key] = true
          fmCells.push({sx:sx,sz:sz})
          if (fmCells.length >= 4096) break
        }
        if (fmCells.length >= 4096) break
      }
      if (fmCells.length >= 4096) break
    }
  }
  return true
}

function fmSurvey(level, cell) {
  var probes = [[0.5,0.5],[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]]
  var key = cell.sx+','+cell.sz
  var record = fmTerrain[key] || {samples:{}}
  if (!record.samples) record.samples = {}
  for (var p=0;p<probes.length;p++) {
    if (record.samples[String(p)]) continue
    var x = Math.floor((cell.sx+probes[p][0])*fmMetadata.sector_size)
    var z = Math.floor((cell.sz+probes[p][1])*fmMetadata.sector_size)
    if (!level.getChunkSource().hasChunk(x>>4,z>>4)) continue
    var y = level.getHeight(FM_Height.MOTION_BLOCKING_NO_LEAVES,x,z)
    var pos = new FM_Pos(x,y-1,z)
    var biomeHolder = level.getBiome(pos)
    var biome = biomeHolder.unwrapKey()
    var id = biome.isPresent() ? String(biome.get().location()) : ''
    var water = String(FM_Registry.BLOCK.getKey(level.getBlockState(pos).getBlock())) === 'minecraft:water'
    // The biome tag covers vanilla, deep/frozen oceans and modded oceans such as
    // correctly tagged Terralith biomes. The name check is a fallback for a mod
    // that forgot to add its ocean biome to the standard tag.
    var taggedOcean = false
    try { taggedOcean = biomeHolder.is(FM_BiomeTags.IS_OCEAN) } catch (fmOceanTagError) {}
    var oceanBiome = taggedOcean || id.indexOf('ocean') >= 0
    record.samples[String(p)] = {water:water || id.indexOf('ocean')>=0 || id.indexOf('river')>=0,
      ocean:oceanBiome,
      river:id.indexOf('river')>=0, mountain:id.indexOf('peak')>=0 || id.indexOf('mountain')>=0,
      forest:id.indexOf('forest')>=0 || id.indexOf('taiga')>=0, y:y}
  }
  var keys = Object.keys(record.samples)
  if (!keys.length) return
  var wet=0,ocean=0,river=0,mountain=0,forest=0,height=0
  for (var k=0;k<keys.length;k++) {
    var sample=record.samples[keys[k]]
    if(sample.water)wet++
    if(sample.ocean)ocean++
    if(sample.river)river++
    if(sample.mountain)mountain++
    if(sample.forest)forest++
    height+=sample.y
  }
  record.known=keys.length
  record.water_fraction=wet/keys.length
  record.ocean_fraction=ocean/keys.length
  // Classify immediately from the probes that are actually available. Previously
  // three probes were required, so partly loaded ocean sectors stayed green.
  record.ocean=ocean>0 && ocean/keys.length>=0.5
  record.river=river>0
  record.mountain=mountain>0
  record.terrain=record.ocean?'ocean':(river>0?'river':(wet/keys.length>=0.5?'water':(mountain>0?'mountain':(forest>0?'forest':'land'))))
  record.height=Math.round(height/keys.length)
  fmTerrain[key]=record
}

ServerEvents.tick(event => {
  fmClock++
  if (fmClock%20!==0) return
  var mapServer=event.server
  if (fmClock%400===20 || !fmMetadata) {
    if (!fmPrepare(mapServer)) return
  }
  if(fmCells.length) {
    // Loaded-chunk checks are cheap and never generate terrain. A small batch
    // makes explored coastlines appear on the map without a long full-map wait.
    for (var scan=0;scan<FM_SURVEY_PER_SECOND;scan++) {
      fmSurvey(mapServer.overworld(),fmCells[fmCursor%fmCells.length])
      fmCursor++
    }
  }
  if(fmClock%400!==0) return
  var encodedSnapshot=global.frontMapBuild(mapServer)
  if(!encodedSnapshot) return
  var snapshot=JSON.parse(String(encodedSnapshot))
  snapshot.terrain={}
  var terrainKeys=Object.keys(fmTerrain)
  for(var t=0;t<terrainKeys.length;t++) {
    var entry=fmTerrain[terrainKeys[t]]
    snapshot.terrain[terrainKeys[t]]={terrain:entry.terrain,known:entry.known,water_fraction:entry.water_fraction,
      ocean:entry.ocean,ocean_fraction:entry.ocean_fraction,river:entry.river,mountain:entry.mountain,height:entry.height}
  }
  snapshot.updated=Number(fmClock)
  snapshot.updated_clock='bridge_session_ticks'
  snapshot.survey_limit=4096
  mapServer.persistentData.putString('front_cc_snapshot',JSON.stringify(snapshot))
  mapServer.persistentData.putString('front_cc_terrain',JSON.stringify(fmTerrain))
})

// Requires KubeJS + CC:Tweaked. Attach a lectern to an advanced computer.
function fccReadChunks(data,key) {
  var count=Math.max(0,Number(data.getInt(key+'_parts') || 0))
  if(count>0 && count<256) {
    var result=''
    for(var i=0;i<count;i++)result+=String(data.getString(key+'_'+i))
    return result
  }
  return String(data.getString(key) || '')
}

ComputerCraftEvents.peripheral(event => {
  event.registerPeripheral('front_map', 'minecraft:lectern')
    .mainThreadMethod('getMapJSON', () => {
      var data=Utils.getServer().persistentData
      var encoded=fccReadChunks(data,'front_cc_snapshot')
      if(!encoded)return ''
      try {
        var snapshot=JSON.parse(encoded)
        var survey=JSON.parse(fccReadChunks(data,'front_cc_survey') || '{}')
        snapshot.terrain={}
        var keys=Object.keys(survey)
        for(var i=0;i<keys.length;i++) {
          var entry=survey[keys[i]]
          snapshot.terrain[keys[i]]={terrain:entry.terrain,known:entry.known,water_fraction:entry.water_fraction,
            ocean:entry.ocean,ocean_fraction:entry.ocean_fraction,river:entry.river,mountain:entry.mountain,height:entry.height}
        }
        return JSON.stringify(snapshot)
      } catch(error) {
        console.warn('[Front Map] Failed to rebuild chunked snapshot: '+error)
        return ''
      }
    })
})

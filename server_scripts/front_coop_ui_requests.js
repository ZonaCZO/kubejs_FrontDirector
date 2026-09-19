var fcuiRecent={}
function fcuiAllow(player,action){
  var now=Date.now(),key=String(player.uuid)+'|'+String(action),last=Number(fcuiRecent[key]||0)
  if(now-last<150)return false
  fcuiRecent[key]=now
  if(Object.keys(fcuiRecent).length>256)for(var oldKey in fcuiRecent)if(now-Number(fcuiRecent[oldKey])>10000)delete fcuiRecent[oldKey]
  return true
}
NetworkEvents.dataReceived('front:coop_ui_request',event=>{
  var player=event.player,server=player.server,action=(String(event.data.getString('action'))||'view'),message=''
  try {
    if(action==='view'){fcSend(player);return}
    if(!fcGranted(player))throw new Error('Only the host, an operator or appointed GM can configure war.')
    var now=fdGameTime(server)
    if(!fcuiAllow(player,action))return
    if(action==='mode') {
      player.persistentData.putBoolean('front_coop_gm_mode',!player.persistentData.getBoolean('front_coop_gm_mode'))
      player.persistentData.putLong('front_coop_confirm',0)
      fcSend(player);return
    }
    if(action==='grant' || action==='revoke') {
      if(!fcOwner(player))throw new Error('Only the host or an operator may appoint a GM.')
      var name=String(event.data.getString('name'))
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
        var side=event.data.getDouble('side'),direction=String(event.data.getString('direction'))
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
  } catch(error) {console.warn('[Co-op UI] '+String(error));player.tell('[Штаб] '+String(error));fcSend(player,String(error).slice(0,180))}
})

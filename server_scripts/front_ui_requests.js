// Explicit NBT readers and responses. Existing front rules remain authoritative.
var fuiRecent={}
function fuiAllow(player,action){
 var now=Date.now(),key=String(player.uuid)+'|'+String(action),last=Number(fuiRecent[key]||0)
 if(now-last<150)return false
 fuiRecent[key]=now
 if(Object.keys(fuiRecent).length>256)for(var oldKey in fuiRecent)if(now-Number(fuiRecent[oldKey])>10000)delete fuiRecent[oldKey]
 return true
}
function fuiText(data,key){return String(data.getString(key))}
function fuiError(p,error){p.tell('[Штаб] '+String(error));console.warn('[HQ UI] '+String(error))}
function fuiInit(server){if(!fdInitialized&&!fdInitialize(server))throw Error('Не удалось загрузить фронт.')}
function fuiHq(p){
 var payload=fdHqPayload(p.server,p)
 payload.resetArmed=Number(p.persistentData.getLong('front_reset_until'))>fdGameTime(p.server)
 p.sendData('front:hq_data',payload)
}
NetworkEvents.dataReceived('front:hq_ui_request',event=>{
 var p=event.player,s=p.server,d=event.data,a=fuiText(d,'action')
 try{
  fuiInit(s)
  if(a==='refresh'){}
  else if(a==='garrison'||a==='upgrade')fdGarrisonCommand({source:{player:p,server:s}},a==='garrison'?'deploy':'upgrade')
  else if(a==='map')fdFrontMapCommand({source:{player:p,server:s}})
  else if(a==='language'){
   var language=fuiText(d,'language')
   if(['ru','uk','en'].indexOf(language)<0)throw Error('Неизвестный язык.')
   p.persistentData.putString('front_language',language)
  }else if(a==='state_name'){
   if(!fdSetStateName(p,fuiText(d,'name')))throw Error('Название должно содержать от 3 до 32 символов.')
   p.tell('[Штаб] Название государства сохранено.')
  }else if(a==='enemy_name'){
   if(!fcCanEdit(p))throw Error('Для названия противника включи режим ГМа.')
   var name=fuiText(d,'name').replace(/[\x00-\x1F\x7F§:]/g,'').trim()
   if(name.length<3||name.length>32)throw Error('Название должно содержать от 3 до 32 символов.')
   s.persistentData.putString('front_enemy_name',name)
   p.tell('[Штаб] Название противника сохранено.')
  }else throw Error('Неизвестное действие: '+a)
  fuiHq(p)
 }catch(error){fuiError(p,error);try{fuiHq(p)}catch(ignored){}}
})
NetworkEvents.dataReceived('front:services_ui_request',event=>{
 var p=event.player,s=p.server,d=event.data,a=fuiText(d,'action'),tab=fuiText(d,'tab')||a
 try{
  fuiInit(s)
  if(a==='profile_save'){
   p.persistentData.putString('front_rp_role',fwCleanText(fuiText(d,'role'),32))
   p.persistentData.putString('front_rp_callsign',fwCleanText(fuiText(d,'callsign'),32))
   p.persistentData.putString('front_rp_flag',fwCleanText(fuiText(d,'flag'),12))
   tab='profile';p.tell('[Штаб] Профиль сохранён.')
  }else if(a==='read'){p.persistentData.putLong('front_mail_read',fdGameTime(s));tab='mail'}
  else if(a==='mission'){
   fwLoad(s)
   var owner=fwPlayerKey(p),now=fdGameTime(s),current=fwData.missions[owner]
   if(current&&current.expires>now)throw Error('У тебя уже есть активная задача. Сначала заверши или отмени её.')
   if(Number(fwData.cooldowns[owner]||0)>now)throw Error('Следующая задача будет доступна примерно через '+Math.ceil((Number(fwData.cooldowns[owner])-now)/1200)+' мин.')
   var kind=fuiText(d,'kind')
   if(['mortar','depot','headquarters'].indexOf(kind)<0)throw Error('Неизвестный тип задачи.')
   fwMission(s,p,kind);tab='missions'
  }
  else if(a==='cancel'){fwLoad(s);delete fwData.missions[fwPlayerKey(p)];fwSave(s);tab='missions'}
  else if(['mail','profile','missions'].indexOf(a)<0)throw Error('Неизвестное действие: '+a)
  if(['mail','profile','missions'].indexOf(tab)<0)tab='mail'
  fwSend(s,p,tab)
 }catch(error){fuiError(p,error);try{fwSend(s,p,tab)}catch(ignored){}}
})
NetworkEvents.dataReceived('front:admin_ui_request',event=>{
 var p=event.player,s=p.server,a=fuiText(event.data,'action')
 try{
  if(!fcCanEdit(p))throw Error('Нет активного режима ГМа.')
  fuiInit(s)
  var now=fdGameTime(s)
  // Runtime-only debounce cannot become permanently stuck in world NBT.
  if(!fuiAllow(p,a))return
  if(a==='pause_toggle'){
   var paused=!s.persistentData.getBoolean('front_gm_paused')
   s.persistentData.putBoolean('front_gm_paused',paused)
   p.tell('[Штаб] '+(paused?'Война на паузе.':'Война продолжена.'))
  }else if(a==='pace_cycle'||a==='pace_up'||a==='pace_down'){
   var paces=[0,35,100,200,400],current=fdWarPace(s),index=paces.indexOf(current)
   if(index<0)index=paces.indexOf(100)
   var direction=a==='pace_down'?-1:1
   var next=paces[(index+direction+paces.length)%paces.length]
   fdSetWarPace(s,next)
   p.tell('[Штаб] Темп стратегического наступления: '+next+'%.')
  }else if(a==='advance_now'){
   if(s.persistentData.getBoolean('front_gm_paused'))throw Error('Сначала продолжи войну: на полной паузе ход противника недоступен.')
   fdStrategicExpansion(s)
   fdExpansionClock=Number(fdConfig.expansionIntervalMinutes)*60*20
   p.tell('[Штаб] Выполнен один стратегический ход противника.')
  }else if(a==='control_plus'||a==='control_minus'){
   var sx=fdSX(p.x),sz=fdSZ(p.z)
   if(String(p.level.dimension)!=='minecraft:overworld'||!fdAllowedSector(sx,sz))throw Error('Встань в доступную боевую зону, не в безопасную территорию.')
   fdSetControl(sx,sz,fdControl(sx,sz)+(a==='control_plus'?25:-25));fdRebuildSupply();fdSave(s)
  }else if(a==='supplies')p.give(Item.of('kubejs:military_supply_crate',4))
  else if(a==='heal'){p.setHealth(p.getMaxHealth());p.tell('[Штаб] Здоровье восстановлено.')}
  else if(a==='purge'){
   var entities=fdWorld(s).getAllEntities().iterator(),count=0
   while(entities.hasNext()){
    var entity=entities.next()
    if(entity.getTags().contains('fd_robot')){entity.discard();count++}
   }
   fdTrackedRobots=[]
   p.tell('[Штаб] Удалено роботов директора: '+count+'. Контроль зон сохранён.')
  }else if(a==='reset_arm'){
   p.persistentData.putLong('front_reset_until',now+200)
   p.tell('[Штаб] Подтверди сброс войны вторым нажатием в течение 10 секунд.')
  }else if(a==='reset'){
   if(Number(p.persistentData.getLong('front_reset_until'))<=now)throw Error('Подтверждение истекло. Сначала нажми «Сбросить войну».')
   p.persistentData.putLong('front_reset_until',0)
   fdResetWar({source:{server:s,player:p}})
  }else throw Error('Неизвестное действие: '+a)
  fuiHq(p)
 }catch(error){fuiError(p,error);try{fuiHq(p)}catch(ignored){}}
})

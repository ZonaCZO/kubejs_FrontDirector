var hqPacketOnceRecent={}
function hqPacketOnce(channel,data){
 var now=Date.now(),key=channel+'|'+JSON.stringify(data)
 if(hqPacketOnceRecent[key]!==undefined && now-hqPacketOnceRecent[key]<150)return false
 hqPacketOnceRecent[key]=now
 for(var oldKey in hqPacketOnceRecent)if(now-hqPacketOnceRecent[oldKey]>5000)delete hqPacketOnceRecent[oldKey]
 Client.player.sendData(channel,data)
 return true
}
function frontTabClick(tab){return function(){frontSelectTab(tab)}}
var frontHqData={},frontHqNameInput='',frontEnemyInput='',frontHqTab='overview',frontResetConfirm=false
var frontTexts={
 ru:{hq:'ОПЕРАТИВНЫЙ ШТАБ',overview:'Обзор',state:'Государство',gm:'ГМ',cheats:'Читы',sector:'Сектор',control:'Контроль',tro:'ТрО',deploy:'Разместить ТрО (2)',upgrade:'Улучшить ТрО (3/4)',map:'Метки Xaero',services:'Почта / профиль / задачи',refresh:'Обновить',save:'Сохранить',enemy:'Название противника',outside:'Вне зоны БД',safe:'Безопасная зона',front:'Линия фронта',free:'Свободная зона',enemyZone:'Зона противника',pause:'Пауза войны',resume:'Продолжить войну',pace:'Темп наступления',paceShort:'Темп',advance:'Ход противника сейчас',minus:'Контроль −25%',plus:'Контроль +25%',gmInfo:'Управление политико-военной обстановкой',supplies:'Выдать 4 ящика припасов',heal:'Восстановить здоровье',purge:'Удалить роботов директора',reset:'Сбросить войну',confirm:'ПОДТВЕРДИТЬ СБРОС',admin:'Только активный ГМ',paused:'ВОЙНА НА ПАУЗЕ'},
 uk:{hq:'ОПЕРАТИВНИЙ ШТАБ',overview:'Огляд',state:'Держава',gm:'ГМ',cheats:'Чити',sector:'Сектор',control:'Контроль',tro:'ТрО',deploy:'Розмістити ТрО (2)',upgrade:'Покращити ТрО (3/4)',map:'Мітки Xaero',services:'Пошта / профіль / завдання',refresh:'Оновити',save:'Зберегти',enemy:'Назва противника',outside:'Поза зоною БД',safe:'Безпечна зона',front:'Лінія фронту',free:'Вільна зона',enemyZone:'Зона противника',pause:'Пауза війни',resume:'Продовжити війну',pace:'Темп наступу',paceShort:'Темп',advance:'Хід противника зараз',minus:'Контроль −25%',plus:'Контроль +25%',gmInfo:'Керування політико-військовою ситуацією',supplies:'Видати 4 ящики припасів',heal:'Відновити здоров’я',purge:'Прибрати роботів директора',reset:'Скинути війну',confirm:'ПІДТВЕРДИТИ СКИДАННЯ',admin:'Лише активний ГМ',paused:'ВІЙНА НА ПАУЗІ'},
 en:{hq:'OPERATIONS HEADQUARTERS',overview:'Overview',state:'State',gm:'GM',cheats:'Cheats',sector:'Sector',control:'Control',tro:'Defence',deploy:'Deploy defence (2)',upgrade:'Upgrade defence (3/4)',map:'Xaero waypoints',services:'Mail / profile / operations',refresh:'Refresh',save:'Save',enemy:'Enemy name',outside:'Outside war area',safe:'Safe zone',front:'Frontline',free:'Free zone',enemyZone:'Enemy zone',pause:'Pause war',resume:'Resume war',pace:'Offensive pace',paceShort:'Pace',advance:'Enemy turn now',minus:'Control -25%',plus:'Control +25%',gmInfo:'Political and military situation control',supplies:'Give 4 supply crates',heal:'Restore health',purge:'Remove director robots',reset:'Reset war',confirm:'CONFIRM WAR RESET',admin:'Active GM only',paused:'WAR PAUSED'}
}
function frontHqSend(action){hqPacketOnce('front:hq_ui_request',{action:action})}
function frontAdminSend(action){hqPacketOnce('front:admin_ui_request',{action:action})}
function frontSelectTab(tab){frontHqTab=tab;frontResetConfirm=false;GuiJS.open('front:headquarters')}
NetworkEvents.dataReceived('front:hq_data',event=>{
 var d=event.data;frontHqData={};
 for(var key of ['stateName','enemyName','language','sector','zoneCode'])frontHqData[key]=String(d.getString(key));
 for(var key of ['canEdit','warPaused','resetArmed'])frontHqData[key]=d.getBoolean(key);
 for(var key of ['control','garrisonStrength','garrisonMax','warPace'])frontHqData[key]=d.getDouble(key);
 frontResetConfirm=frontHqData.resetArmed;
frontHqNameInput=String(frontHqData.stateName);frontEnemyInput=String(frontHqData.enemyName)
 if(!frontHqData.canEdit && (frontHqTab==='gm' || frontHqTab==='cheats'))frontHqTab='overview'
 GuiJS.open('front:headquarters')
})
GUIEvents.createUI('front:headquarters',event=>{
 var t=frontTexts[String(frontHqData.language)] || frontTexts.ru,w=320,h=220
 var x=Math.floor((Client.window.guiScaledWidth-w)/2),y=Math.floor((Client.window.guiScaledHeight-h)/2)
 event.setBackground('kubejs:textures/gui/front_hq.png',x,y,w,h);event.pauseGame(false);event.background(true)
 event.label('§b§l'+t.hq,x+12,y+10)
 var tabs=frontHqData.canEdit?['overview','state','gm','cheats']:['overview','state']
 for(var i=0;i<tabs.length;i++){
  var tab=tabs[i]
  event.button((frontHqTab===tab?'§b':'§7')+t[tab],x+12+i*76,y+28,72,18).onClick(frontTabClick(tab))
 }
 var short=value=>String(value || '').slice(0,44)
 if(frontHqTab==='state'){
  event.label('§7'+t.state,x+12,y+60)
  event.textBox(x+12,y+76,208,18).setValue(frontHqNameInput).onTextChanged(v=>{frontHqNameInput=String(v)})
  event.button(t.save,x+228,y+76,80,18).onClick(()=>hqPacketOnce('front:hq_ui_request',{action:'state_name',name:frontHqNameInput}))
  if(frontHqData.canEdit){
   event.label('§7'+t.enemy,x+12,y+110)
   event.textBox(x+12,y+126,208,18).setValue(frontEnemyInput).onTextChanged(v=>{frontEnemyInput=String(v)})
   event.button(t.save,x+228,y+126,80,18).onClick(()=>hqPacketOnce('front:hq_ui_request',{action:'enemy_name',name:frontEnemyInput}))
  }
 } else if(frontHqTab==='gm' && frontHqData.canEdit){
  event.label('§7'+t.gmInfo,x+12,y+60)
  event.label(t.sector+': '+short(frontHqData.sector),x+12,y+78)
  event.button(frontHqData.warPaused?t.resume:t.pause,x+12,y+96,296,18).onClick(()=>frontAdminSend('pause_toggle'))
  event.button('−',x+12,y+118,24,18).onClick(()=>frontAdminSend('pace_down'))
  event.button(t.paceShort+': '+String(frontHqData.warPace)+'%',x+40,y+118,88,18).onClick(()=>frontAdminSend('pace_cycle'))
  event.button('+',x+132,y+118,24,18).onClick(()=>frontAdminSend('pace_up'))
  event.button(t.advance,x+164,y+118,144,18).onClick(()=>frontAdminSend('advance_now'))
  event.button(t.minus,x+12,y+140,144,18).onClick(()=>frontAdminSend('control_minus'))
  event.button(t.plus,x+164,y+140,144,18).onClick(()=>frontAdminSend('control_plus'))
  event.label('§8'+t.admin,x+12,y+166)
 } else if(frontHqTab==='cheats' && frontHqData.canEdit){
  event.button(t.supplies,x+12,y+60,296,20).onClick(()=>frontAdminSend('supplies'))
  event.button(t.heal,x+12,y+86,296,20).onClick(()=>frontAdminSend('heal'))
  event.button(t.purge,x+12,y+112,296,20).onClick(()=>frontAdminSend('purge'))
  event.button('§c'+(frontResetConfirm?t.confirm:t.reset),x+12,y+146,296,20).onClick(()=>{
   if(frontResetConfirm){frontAdminSend('reset')}else{frontAdminSend('reset_arm')}
  })
 } else {
  event.label('§f§l'+short(frontHqData.stateName),x+12,y+60)
  event.label('§7'+t.sector+': §f'+short(frontHqData.sector),x+12,y+78)
  event.label(frontHqData.warPaused?'§e'+t.paused:'§b'+(frontHqData.zoneCode==='enemy'?t.enemyZone:(t[String(frontHqData.zoneCode)] || t.enemyZone)),x+12,y+94)
  event.label('§7'+short(frontHqData.enemyName)+' §8| §f'+t.control+': '+String(frontHqData.control)+'%',x+12,y+110)
  event.label('§7'+t.tro+': §f'+String(frontHqData.garrisonStrength)+'/'+String(frontHqData.garrisonMax),x+12,y+126)
  event.button(t.deploy,x+12,y+146,144,20).onClick(()=>frontHqSend('garrison'))
  event.button(t.upgrade,x+164,y+146,144,20).onClick(()=>frontHqSend('upgrade'))
  event.button(t.map,x+12,y+172,144,20).onClick(()=>frontHqSend('map'))
  event.button('HQ+',x+164,y+172,144,20).onClick(()=>hqPacketOnce('front:services_ui_request',{action:'mail'}))
 }
 event.button(t.refresh,x+12,y+198,64,16).onClick(()=>frontHqSend('refresh'))
 event.button('Co-op',x+80,y+198,84,16).onClick(()=>hqPacketOnce('front:coop_ui_request',{action:'view'}))
 event.button('RU',x+176,y+198,40,16).onClick(()=>hqPacketOnce('front:hq_ui_request',{action:'language',language:'ru'}))
 event.button('UK',x+222,y+198,40,16).onClick(()=>hqPacketOnce('front:hq_ui_request',{action:'language',language:'uk'}))
 event.button('EN',x+268,y+198,40,16).onClick(()=>hqPacketOnce('front:hq_ui_request',{action:'language',language:'en'}))
})

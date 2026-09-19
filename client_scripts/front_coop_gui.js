var fcPacketOnceRecent={}
var fcUiOpenDelay=0
function fcQueueOpen(){fcUiOpenDelay=2}
ClientEvents.tick(event=>{
 if(fcUiOpenDelay<=0)return
 fcUiOpenDelay--
 if(fcUiOpenDelay===0 && Client.player)GuiJS.open('front:coop')
})
function fcPacketOnce(channel,data){
 var now=Date.now(),key=channel+'|'+JSON.stringify(data)
 if(fcPacketOnceRecent[key]!==undefined && now-fcPacketOnceRecent[key]<150)return false
 fcPacketOnceRecent[key]=now
 for(var oldKey in fcPacketOnceRecent)if(now-fcPacketOnceRecent[oldKey]>5000)delete fcPacketOnceRecent[oldKey]
 if(!Client.player)return false
 Client.player.sendData(channel,data)
 return true
}
function fcPageClick(page){return function(){fcUiPage=page;fcQueueOpen()}}
var fcUiData={},fcUiPage='setup',fcUiName='',fcUiSide=2048,fcUiDir='north'
var fcUiText={
 ru:{title:'НАСТРОЙКА КООПА',setup:'Территория',people:'Доступ',preview:'Предпросмотр',mode:'Режим ГМа',on:'ВКЛ',off:'ВЫКЛ',warA:'Зона БД: угол 1 здесь',warB:'Зона БД: угол 2 здесь',safeA:'Мирная зона: угол 1',safeB:'Мирная зона: угол 2',origin:'Очаг вторжения здесь',auto:'Создать вокруг меня',size:'Размер',direction:'Противник',clear:'Очистить черновик',arm:'Проверить и подтвердить',apply:'ПРИМЕНИТЬ',grant:'Назначить ГМом',revoke:'Отозвать права',name:'Ник игрока онлайн',denied:'Настраивает хост или назначенный ГМ',legend:'Схема: синий — война, зелёный — база, красный — очаг',north:'Север',south:'Юг',west:'Запад',east:'Восток',back:'Штаб',hint:'Применение заменит границы и поставит войну на паузу'},
 uk:{title:'НАЛАШТУВАННЯ КООПУ',setup:'Територія',people:'Доступ',preview:'Перегляд',mode:'Режим ГМа',on:'УВІМК',off:'ВИМК',warA:'Зона БД: кут 1 тут',warB:'Зона БД: кут 2 тут',safeA:'Мирна зона: кут 1',safeB:'Мирна зона: кут 2',origin:'Осередок вторгнення тут',auto:'Створити навколо мене',size:'Розмір',direction:'Противник',clear:'Очистити чернетку',arm:'Перевірити й підтвердити',apply:'ЗАСТОСУВАТИ',grant:'Призначити ГМом',revoke:'Відкликати права',name:'Нік гравця онлайн',denied:'Налаштовує хост або призначений ГМ',legend:'Схема: синій — війна, зелений — база, червоний — осередок',north:'Північ',south:'Південь',west:'Захід',east:'Схід',back:'Штаб',hint:'Застосування замінить межі й поставить війну на паузу'},
 en:{title:'CO-OP SETUP',setup:'Territory',people:'Access',preview:'Preview',mode:'GM mode',on:'ON',off:'OFF',warA:'War area: corner 1 here',warB:'War area: corner 2 here',safeA:'Safe area: corner 1',safeB:'Safe area: corner 2',origin:'Enemy origin here',auto:'Generate around me',size:'Size',direction:'Enemy',clear:'Clear draft',arm:'Validate and confirm',apply:'APPLY',grant:'Appoint GM',revoke:'Revoke access',name:'Online player name',denied:'Only host or appointed GM may configure',legend:'Diagram: blue war, green base, red origin',north:'North',south:'South',west:'West',east:'East',back:'HQ',hint:'Apply replaces boundaries and pauses the war'}
}
function fcUiSend(action,extra){var data=extra||{};data.action=action;fcPacketOnce(action==='mode'?'front:gm_toggle':'front:coop_ui_request',data)}
NetworkEvents.dataReceived('front:coop_data',event=>{fcUiData=event.data;fcUiData={language:event.data.getString('language'),active:event.data.getBoolean('active'),granted:event.data.getBoolean('granted'),owner:event.data.getBoolean('owner'),armed:event.data.getBoolean('armed'),paused:event.data.getBoolean('paused'),draft:event.data.getString('draft'),message:event.data.getString('message')};fcQueueOpen()})
GUIEvents.createUI('front:coop',event=>{
 var t=fcUiText[String(fcUiData.language)]||fcUiText.ru,w=Math.min(400,Client.window.guiScaledWidth-8),h=Math.min(280,Client.window.guiScaledHeight-8)
 var x=Math.floor((Client.window.guiScaledWidth-w)/2),y=Math.floor((Client.window.guiScaledHeight-h)/2)
 event.setBackground('kubejs:textures/gui/front_services.png',x,y,w,h);event.pauseGame(false);event.background(true)
 var raw=event,sx=w/400,sy=h/280
 event={
  label:(text,px,py)=>raw.label(String(text).slice(0,Math.max(1,Math.floor((w-(px-x)*sx-12)/6))),x+(px-x)*sx,y+(py-y)*sy),
  button:(text,px,py,bw,bh)=>raw.button(String(text).slice(0,Math.max(1,Math.floor((bw*sx-8)/6))),x+(px-x)*sx,y+(py-y)*sy,bw*sx,bh*sy),
  textBox:(px,py,bw,bh)=>raw.textBox(x+(px-x)*sx,y+(py-y)*sy,bw*sx,bh*sy)
 }
 event.label('§b§l'+t.title,x+12,y+10)
 var pages=['setup','people','preview']
 for(var i=0;i<pages.length;i++){var page=pages[i];event.button(t[page],x+12+i*126,y+28,120,18).onClick(fcPageClick(page))}
 function button(title,dx,dy,width,action,extra){event.button(title,x+dx,y+dy,width,18).onClick(()=>fcUiSend(action,extra))}
 button(t.mode+': '+(fcUiData.active?t.on:t.off),12,52,376,'mode')
 if(!fcUiData.granted)event.label('§7'+t.denied,x+12,y+82)
 else if(fcUiPage==='people'){
  event.label('§7'+t.name,x+12,y+82)
  event.textBox(x+12,y+100,376,18).setValue(fcUiName).onTextChanged(v=>{fcUiName=String(v)})
  if(fcUiData.owner){
   event.button(t.grant,x+12,y+128,184,18).onClick(()=>fcUiSend('grant',{name:fcUiName}))
   event.button(t.revoke,x+204,y+128,184,18).onClick(()=>fcUiSend('revoke',{name:fcUiName}))
  }else event.label('§7Host / OP only',x+12,y+130)
 }else if(fcUiPage==='setup'){
  button(t.warA,12,80,184,'war_a');button(t.warB,204,80,184,'war_b')
  button(t.safeA,12,104,184,'safe_a');button(t.safeB,204,104,184,'safe_b')
  button(t.origin,12,128,376,'origin')
  event.button(t.size+': '+fcUiSide,x+12,y+154,184,18).onClick(()=>{fcUiSide=fcUiSide===1024?2048:fcUiSide===2048?4096:1024;fcQueueOpen()})
  event.button(t.direction+': '+t[fcUiDir],x+204,y+154,184,18).onClick(()=>{var dirs=['north','east','south','west'];fcUiDir=dirs[(dirs.indexOf(fcUiDir)+1)%4];fcQueueOpen()})
  event.button(t.auto,x+12,y+178,376,18).onClick(()=>fcUiSend('auto',{side:fcUiSide,direction:fcUiDir}))
  button(t.clear,12,202,376,'clear')
 }else{
  var d={};try{d=JSON.parse(String(fcUiData.draft||'{}'))}catch(ignored){}
  if(d.war){
   for(var row=0;row<8;row++)for(var col=0;col<16;col++){
    var px=d.war.x1+(col+0.5)*(d.war.x2-d.war.x1)/16,pz=d.war.z1+(row+0.5)*(d.war.z2-d.war.z1)/8,color='§9'
    if(d.safe&&px>=d.safe.x1&&px<=d.safe.x2&&pz>=d.safe.z1&&pz<=d.safe.z2)color='§a'
    if(d.origin&&Math.floor((d.origin.x-d.war.x1)*16/(d.war.x2-d.war.x1))===col&&Math.floor((d.origin.z-d.war.z1)*8/(d.war.z2-d.war.z1))===row)color='§c'
    event.label(color+'#',x+12+col*10,y+78+row*10)
   }
   event.label('X '+d.war.x1+' .. '+d.war.x2,x+190,y+82)
   event.label('Z '+d.war.z1+' .. '+d.war.z2,x+190,y+100)
   if(d.origin)event.label('Origin: '+d.origin.x+', '+d.origin.z,x+190,y+118)
  }
  event.label('§7'+t.legend,x+12,y+168)
  event.label('§7'+t.hint,x+12,y+184)
  button(fcUiData.armed?'§c'+t.apply:t.arm,12,208,376,fcUiData.armed?'apply':'arm')
 }
 if(fcUiData.message)event.label('§e'+String(fcUiData.message).slice(0,62),x+12,y+234)
 event.button(t.back,x+12,y+254,376,18).onClick(()=>fcPacketOnce('front:hq_ui_request',{action:'refresh'}))
})

var frontHqKeyCooldown=0
ClientEvents.tick(event=>{
  if(frontHqKeyCooldown>0)frontHqKeyCooldown--
  var key=global.frontHqKey
  if(!key)return
  var pressed=false
  while(key.consumeClick())pressed=true
  // Drain queued presses even while menus are open, so closing chat cannot open HQ.
  if(!pressed || !Client.player || Client.screen!=null || frontHqKeyCooldown>0)return
  frontHqKeyCooldown=10
  Client.player.sendData('front:hq_ui_request',{action:'refresh'})
})

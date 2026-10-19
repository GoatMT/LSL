// A restrained lens avoids the exaggerated edge perspective of wide phone screens.
export function mobileLens(verticalFov,aspect){
  const rad=Math.PI/180;
  const fov=Math.min(verticalFov,52,2*Math.atan(Math.tan(38*rad)/Math.max(.25,aspect))/rad);
  return {fov,distanceScale:Math.tan(verticalFov*rad/2)/Math.tan(fov*rad/2)};
}
export function canvasSize(canvas,fallbackWidth=1,fallbackHeight=1){
  return {width:Math.max(1,Math.round(canvas.clientWidth||fallbackWidth)),height:Math.max(1,Math.round(canvas.clientHeight||fallbackHeight))};
}

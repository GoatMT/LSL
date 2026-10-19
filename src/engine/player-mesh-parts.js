import * as T from '../../vendor/three.module.js';

// Static pieces on each animated joint are merged into one draw call.
export const playerShapes={
  sphere:new T.SphereGeometry(1,32,24),limb:new T.CylinderGeometry(1,1,1,28),
  taper:new T.CylinderGeometry(.88,1,1,28),box:new T.BoxGeometry(1,1,1),
  cap:new T.SphereGeometry(1,28,20,0,Math.PI*2,0,Math.PI*.52),
  collar:new T.TorusGeometry(1,.15,12,32)
};
export const jointMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.79,metalness:0});

export function part(shape,color,x,y,z,sx,sy=sx,sz=sx,rx=0,ry=0,rz=0){
  return {shape,color,position:[x,y,z],scale:[sx,sy,sz],rotation:[rx,ry,rz]};
}

export function mergeParts(parts){
  const vertices=[],normals=[],colors=[],matrix=new T.Matrix4(),normalMatrix=new T.Matrix3(),transform=new T.Object3D(),v=new T.Vector3(),n=new T.Vector3();
  for(const item of parts){
    const source=playerShapes[item.shape],geometry=source.index?source.toNonIndexed():source;
    transform.position.set(...item.position);transform.scale.set(...item.scale);transform.rotation.set(...item.rotation);transform.updateMatrix();matrix.copy(transform.matrix);normalMatrix.getNormalMatrix(matrix);
    const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),color=new T.Color(item.color);
    for(let i=0;i<position.count;i++){
      v.fromBufferAttribute(position,i).applyMatrix4(matrix);n.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);
      vertices.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);colors.push(color.r,color.g,color.b);
    }
    if(geometry!==source)geometry.dispose();
  }
  const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(vertices,3));result.setAttribute('normal',new T.Float32BufferAttribute(normals,3));result.setAttribute('color',new T.Float32BufferAttribute(colors,3));result.computeBoundingSphere();return result;
}

export function solid(parts){const m=new T.Mesh(mergeParts(parts),jointMaterial);m.castShadow=m.receiveShadow=true;return m;}

export function tailoredTorso(bulk=0){
  const profile=[[0,.255,.15],[.08,.26,.158],[.18,.272,.17],[.32,.284,.178],[.44,.30,.18],[.56,.32,.17],[.66,.34,.155],[.72,.305,.145],[.76,.235,.13]],rings=36,segments=32,positions=[],uv=[],indices=[];
  const radiusAt=(y,column)=>{let i=0;while(i<profile.length-2&&profile[i+1][0]<y)i++;const [y0,...a]=profile[i],[y1,...b]=profile[i+1],t=Math.max(0,Math.min(1,(y-y0)/(y1-y0))),smooth=t*t*(3-2*t);return a[column-1]+(b[column-1]-a[column-1])*smooth;};
  for(let r=0;r<=rings;r++){const v=r/rings,y=v*.76,belly=Math.exp(-Math.pow((v-.34)/.25,2))*bulk,rx=radiusAt(y,1)*(1+belly*.30),rz=radiusAt(y,2)*(1+belly*.20);for(let s=0;s<=segments;s++){const u=s/segments,a=u*Math.PI*2;positions.push(Math.sin(a)*rx,y,Math.cos(a)*rz);uv.push(u,v);}}
  for(let r=0;r<rings;r++)for(let s=0;s<segments;s++){const a=r*(segments+1)+s,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

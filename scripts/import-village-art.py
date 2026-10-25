"""Bake the generated transparent atlas into bounded, palette-friendly native sprites."""
import json
from pathlib import Path
from PIL import Image
source=Path('assets/willowlight/village-atlas.png')
im=Image.open(source).convert('RGBA')
specs=[('oak',128,144),('fir',96,160),('lamp',64,128),('bench',96,64),('barrels',64,64),('crates',64,64),('planter',96,64),('well',96,112),('cottage',192,176),('shed',128,144),('arch',128,128),('sign',48,64),('bush',48,48),('boulder',64,48),('fountain',112,112),('sacks',64,64)]
result=[]
for i,(name,w,h) in enumerate(specs):
 x,y=i%4,i//4
 tile=im.crop((round(x*im.width/4),round(y*im.height/4),round((x+1)*im.width/4),round((y+1)*im.height/4)))
 bbox=tile.getchannel('A').point(lambda a:255 if a>96 else 0).getbbox()
 tile=tile.crop(bbox)
 # Art import, just like the editor's nearest-sampled/downscaled palette export.
 tile=tile.resize((w//2,h//2),Image.Resampling.NEAREST)
 tile=tile.quantize(colors=128,method=Image.Quantize.FASTOCTREE).convert('RGBA')
 pixels=list(tile.getdata())
 pixels=[(r,g,b,255 if a>=128 else 0) for r,g,b,a in pixels]
 result.append({'id':'village_'+name,'name':name.title()+' · village scenery','width':w//2,'height':h//2,'pixels':[c for p in pixels for c in p]})
Path('src/examples/village-art.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print('Baked',len(result),'props at native half-resolution; node scaling remains integer 2x.')

im=Image.open('assets/willowlight/traveller-atlas.png').convert('RGBA')
hero=[]
for row,direction in enumerate(['Down','Up','Left','Right']):
 for frame in range(4):
  tile=im.crop((round(frame*im.width/4),round(row*im.height/4),round((frame+1)*im.width/4),round((row+1)*im.height/4)))
  bbox=tile.getchannel('A').point(lambda a:255 if a>96 else 0).getbbox()
  tile=tile.crop(bbox)
  w=max(1,round(tile.width*44/tile.height))
  tile=tile.resize((w,44),Image.Resampling.NEAREST).quantize(colors=128,method=Image.Quantize.FASTOCTREE).convert('RGBA')
  canvas=Image.new('RGBA',(64,64));canvas.paste(tile,((64-w)//2,8))
  pixels=[(r,g,b,255 if a>=128 else 0) for r,g,b,a in canvas.getdata()]
  hero.append({'id':f'walk_{direction}_{frame}','name':f'Traveller {direction} {frame}','width':64,'height':64,'pixels':[c for p in pixels for c in p]})
Path('src/examples/traveller-art.json').write_text(json.dumps(hero,separators=(',',':'))+'\n')

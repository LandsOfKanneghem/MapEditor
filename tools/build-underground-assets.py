"""Pack generated material swatches into crisp 48px textures and existing edge masks.

Run from any directory: python tools/build-underground-assets.py
Only crops, nearest-neighbor sizing, palette reduction and alpha packing are used.
"""
from pathlib import Path
from PIL import Image, ImageChops

ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'terrain'
source = Image.open(ASSETS / 'sources' / 'underground-materials.png').convert('RGB')
width, height = source.size
xs = [(3, width // 2 - 3), (width // 2 + 3, width - 3)]
ys = [(3, height // 2 - 3), (height // 2 + 3, height - 3)]
materials = [('monastery-floor', 0, 0), ('dirt', 1, 0),
             ('wall-monastery', 0, 1), ('wall-dungeon', 1, 1)]
edge_masks = Image.open(ASSETS / 'sand.png').convert('RGBA').getchannel('A')


def save_edges(name, tile):
    edges = Image.new('RGBA', edge_masks.size)
    for index in range(47):
        x, y = (index % 8) * 48, (index // 8) * 48
        overlay = tile.convert('RGBA')
        overlay.putalpha(edge_masks.crop((x, y, x + 48, y + 48)))
        edges.paste(overlay, (x, y))
    edges.save(ASSETS / f'{name}.png', optimize=True)


for name, column, row in materials:
    texture = source.crop((xs[column][0], ys[row][0], xs[column][1], ys[row][1]))
    texture = texture.resize((24, 24), Image.Resampling.NEAREST)
    texture = texture.quantize(colors=24, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE).convert('RGB')
    tile = texture.resize((48, 48), Image.Resampling.NEAREST)
    if name.startswith('wall-'):
        tile.save(ASSETS / f'{name}.png', optimize=True)
        continue
    variants = Image.new('RGB', (144, 48))
    for variant in range(3):
        shifted = ImageChops.offset(texture, variant * 8, variant * 4)
        variants.paste(shifted.resize((48, 48), Image.Resampling.NEAREST), (variant * 48, 0))
    if name == 'dirt':
        # The old cave soil becomes the one dirt texture everywhere.
        base = Image.open(ASSETS / 'base.png').convert('RGB')
        base.paste(variants, (0, 3 * 48))
        base.save(ASSETS / 'base.png', optimize=True)
        save_edges('dirt', tile)
    else:
        variants.save(ASSETS / f'{name}.png', optimize=True)
        save_edges(f'{name}-edges', tile)

stone = Image.open(ASSETS / 'sources' / 'cave-stone-floor.png').convert('RGB')
small = Image.new('RGB', (72, 24))
for column in range(3):
    panel = stone.crop((round(column * stone.width / 3) + 3, 3,
                        round((column + 1) * stone.width / 3) - 3, stone.height - 3))
    small.paste(panel.resize((24, 24), Image.Resampling.NEAREST), (column * 24, 0))
small = small.quantize(colors=24, method=Image.Quantize.MEDIANCUT,
                       dither=Image.Dither.NONE).convert('RGB')
variants = small.resize((144, 48), Image.Resampling.NEAREST)
variants.save(ASSETS / 'cave-earth.png', optimize=True)
save_edges('cave-earth-edges', variants.crop((0, 0, 48, 48)))

print('Prepared shared dirt, monastery floor, mossy cave stone and wall materials at 48x48.')

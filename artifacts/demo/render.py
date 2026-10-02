import json, subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
data=json.loads((out/'chapters.json').read_text())
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(out/'recording.webm')]))
offset=max(0,float(probe['format']['duration'])-data['duration'])
def stamp(s):
 c=round(s*100);return f'{c//360000}:{c//6000%60:02}:{c//100%60:02}.{c%100:02}'
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1440
PlayResY: 900
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK JP,28,&H00F5F5F5,&H00FFFFFF,&H001A1816,&H001A1816,0,0,0,0,100,100,0,0,1,0,0,2,30,30,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
ass_header=ass
meta=';FFMETADATA1\ntitle=Best ToDo - Web Demo\n'
for i,c in enumerate(data['chapters']):
 end=data['chapters'][i+1]['start'] if i+1<len(data['chapters']) else data['duration']
 ass+=f"Dialogue: 0,{stamp(c['start'])},{stamp(end)},Default,,0,0,0,,{c['title']}\n"
 meta+=f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(c['start']*1000)}\nEND={round(end*1000)}\ntitle={c['title']}\n"
(out/'captions.ass').write_text(ass)
(out/'chapters.ffmeta').write_text(meta)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','warning','-ss',str(offset),'-i',str(out/'recording.webm'),'-i',str(out/'chapters.ffmeta'),'-map_metadata','1','-map_chapters','1','-vf',f'pad=1440:900:0:0:color=0x16181f,ass=captions.ass','-r','30','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out/'best-todo-demo.mp4')],check=True,cwd=out)
print('Created:',out/'best-todo-demo.mp4')

# Six short scenes, each 2.5 seconds: keep the actual UI and replace long captions.
chapters=data['chapters']
scenes=[
 (chapters[3]['start']-3.5,chapters[3]['start'], 'Best ToDo｜タスクをすぐ登録'),
 (chapters[4]['start']-6,chapters[4]['start']-2, 'ステップ・期限・メモで具体化'),
 (chapters[4]['start'],chapters[5]['start'], '終わったらチェックで完了'),
 (chapters[6]['start']-3.5,chapters[6]['start'], 'メモも同じリストに保存'),
 (chapters[7]['start']-3.5,chapters[7]['start'], '表で担当・日付を整理'),
 (chapters[7]['start']+0.8,chapters[8]['start']-1, '検索ですぐ見つかる｜Best ToDo'),
]
short_ass=ass_header
filters=['[0:v]split=6'+''.join(f'[s{i}]' for i in range(6))]
for i,(begin,end,title) in enumerate(scenes):
 short_ass+=f"Dialogue: 0,{stamp(i*2.5)},{stamp((i+1)*2.5)},Default,,0,0,0,,{title}\n"
 filters.append(f'[s{i}]trim=start={offset+begin}:end={offset+end},setpts=(PTS-STARTPTS)*{2.5/(end-begin)},fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=2.5[v{i}]')
(out/'short-captions.ass').write_text(short_ass)
filters.append(''.join(f'[v{i}]' for i in range(6))+f'concat=n=6:v=1:a=0,pad=1440:900:0:0:color=0x16181f,ass=short-captions.ass[short]')
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','warning','-i',str(out/'recording.webm'),'-filter_complex',';'.join(filters),'-map','[short]','-map_metadata','-1','-map_chapters','-1','-t','15','-r','30','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out/'best-todo-demo-short.mp4')],check=True,cwd=out)
print('Created:',out/'best-todo-demo-short.mp4')

# Onboarding video

`edit.jsx` is the Higgsedit motion-graphics edit for the ~55s onboarding video: kinetic titles, stamp slams with shake and flash, HUD scan, chips, and the end slate, laid over the eight Kling clips (`c1.mp4`…`c8.mp4`) and timed to the narration.

Run inside a Higgsfield sandbox with the clips beside it:

```bash
higgsedit build edit.jsx                         # build the project
FRAMES=2.2,10.6 higgsedit build edit.jsx         # also write preview PNGs
RENDER=1 higgsedit build edit.jsx                # render renders/video.mp4
```

The narration is muxed in afterwards with ffmpeg, offset by 0.5s.

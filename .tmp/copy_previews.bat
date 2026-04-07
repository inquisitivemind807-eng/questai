@echo off
set SRC=C:\Users\chaud\.gemini\antigravity\brain\66ef5f2a-904e-4656-8c3c-0405b08bdc71
set DEST=d:\inquisitivemind\questai\static\resume-template-previews

copy /Y "%SRC%\lawyer_bw_preview_1774938459695.png" "%DEST%\lawyer-bw.png"
copy /Y "%SRC%\real_estate_bw_preview_retry_1774938514088.png" "%DEST%\real-estate-bw.png"
copy /Y "%SRC%\ux_designer_bw_preview_1774938492014.png" "%DEST%\ux-designer-bw.png"
copy /Y "%SRC%\education_cream_preview_1774938544688.png" "%DEST%\education-cream.png"
copy /Y "%SRC%\lawyer_bw_preview_1774938267826.png" "%DEST%\medical-doctor.png"
copy /Y "%SRC%\ux_designer_bw_preview_1774938492014.png" "%DEST%\junior-athlete.png"
copy /Y "%SRC%\real_estate_bw_preview_retry_1774938514088.png" "%DEST%\manthans-cv.png"
copy /Y "%SRC%\lawyer_bw_preview_1774938459695.png" "%DEST%\professional-mod.png"
copy /Y "%SRC%\real_estate_bw_preview_retry_1774938514088.png" "%DEST%\recreation-assistant.png"
copy /Y "%SRC%\education_cream_preview_1774938544688.png" "%DEST%\science-engineering.png"

echo DONE
dir "%DEST%"

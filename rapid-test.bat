@echo off
echo === STRESS TEST: Rapid Interactions ===
echo UserA drawing...
mcporter call chrome-devtools-mcp.evaluate_script function="() => { try { document.querySelector('.excalidraw').focus(); return 'focused'; } catch(e) { return e.message; } }"
mcporter call chrome-devtools-mcp.press_key key="t"
mcporter call chrome-devtools-mcp.click uid="38_59"
mcporter call chrome-devtools-mcp.type_text text="STRESS_R1"
mcporter call chrome-devtools-mcp.press_key key="Escape"
mcporter call chrome-devtools-mcp.click uid="38_59"
mcporter call chrome-devtools-mcp.type_text text="STRESS_R2"
mcporter call chrome-devtools-mcp.press_key key="Escape"
mcporter call chrome-devtools-mcp.click uid="38_59"
mcporter call chrome-devtools-mcp.type_text text="STRESS_R3"
mcporter call chrome-devtools-mcp.press_key key="Escape"
echo UserA done. CollabUser2 drawing...
mcporter call chrome-devtools-mcp-2.evaluate_script function="() => { try { document.querySelector('.excalidraw').focus(); return 'focused'; } catch(e) { return e.message; } }"
mcporter call chrome-devtools-mcp-2.press_key key="t"
mcporter call chrome-devtools-mcp-2.click uid="38_59"
mcporter call chrome-devtools-mcp-2.type_text text="C2_R1"
mcporter call chrome-devtools-mcp-2.press_key key="Escape"
mcporter call chrome-devtools-mcp-2.click uid="38_59"
mcporter call chrome-devtools-mcp-2.type_text text="C2_R2"
mcporter call chrome-devtools-mcp-2.press_key key="Escape"
mcporter call chrome-devtools-mcp-2.click uid="38_59"
mcporter call chrome-devtools-mcp-2.type_text text="C2_R3"
mcporter call chrome-devtools-mcp-2.press_key key="Escape"
echo Done. Checking results...
mcporter call chrome-devtools-mcp.list_console_messages
echo ---
mcporter call chrome-devtools-mcp-2.list_console_messages

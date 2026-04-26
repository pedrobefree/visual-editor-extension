/**
 * Attaches pointer-capture drag behaviour to a panel element inside a shadow DOM.
 * The handle element becomes the drag target; the panel element is repositioned.
 *
 * @param panelEl   The element to reposition (must have CSS `position: fixed`).
 * @param handleEl  The element the user grabs (e.g. the panel header).
 * @param getWidth  Optional: returns panel width so we can clamp left edge correctly.
 * @returns A cleanup function that removes all event listeners.
 */
export function attachDrag(
    panelEl: HTMLElement,
    handleEl: HTMLElement,
    getWidth: () => number = () => panelEl.offsetWidth || 300,
    onDragState?: (dragging: boolean) => void,
): () => void {
    const HEADER_H = 40; // minimum px that must stay visible vertically

    const onPointerDown = (e: Event) => {
        const pe = e as PointerEvent;
        // Don't start drag on buttons/inputs inside the handle
        if ((pe.target as HTMLElement).matches('button, input, select, textarea, [data-no-drag]')) return;

        handleEl.setPointerCapture(pe.pointerId);
        handleEl.style.cursor = 'grabbing';
        onDragState?.(true);

        const rect     = panelEl.getBoundingClientRect();
        const startX   = pe.clientX;
        const startY   = pe.clientY;
        const startL   = rect.left;
        const startT   = rect.top;

        // Switch from any right/bottom anchoring to explicit left/top
        panelEl.style.right  = 'auto';
        panelEl.style.bottom = 'auto';
        panelEl.style.left   = `${startL}px`;
        panelEl.style.top    = `${startT}px`;

        const onMove = (me: Event) => {
            const mpe  = me as PointerEvent;
            const W    = getWidth();
            const newL = Math.max(0, Math.min(window.innerWidth  - W,         startL + mpe.clientX - startX));
            const newT = Math.max(0, Math.min(window.innerHeight - HEADER_H,  startT + mpe.clientY - startY));
            panelEl.style.left = `${newL}px`;
            panelEl.style.top  = `${newT}px`;
        };

        const onUp = () => {
            handleEl.style.cursor = 'grab';
            handleEl.removeEventListener('pointermove', onMove);
            handleEl.removeEventListener('pointerup', onUp);
            setTimeout(() => onDragState?.(false), 0);
        };

        handleEl.addEventListener('pointermove', onMove);
        handleEl.addEventListener('pointerup', onUp);
    };

    handleEl.style.cursor = 'grab';
    handleEl.addEventListener('pointerdown', onPointerDown);

    return () => {
        handleEl.removeEventListener('pointerdown', onPointerDown);
        onDragState?.(false);
    };
}

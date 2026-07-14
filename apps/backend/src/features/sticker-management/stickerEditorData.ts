import type {StickerEditorTextBox, StickerEditorUpload} from "@stickermania/shared";

export function isValidStickerEditorUpload(value: unknown): value is StickerEditorUpload {
    if (!value || typeof value !== "object") return false;
    const upload = value as Partial<StickerEditorUpload>;
    return upload.version === 2
        && isPngDataUrl(upload.baseImageDataUrl)
        && isPngDataUrl(upload.paintImageDataUrl)
        && isPositiveFinite(upload.workspace?.width)
        && isPositiveFinite(upload.workspace?.height)
        && typeof upload.outlineWidth === "number"
        && Number.isFinite(upload.outlineWidth)
        && upload.outlineWidth >= 0
        && (!upload.textBox || isValidEditorTextBox(upload.textBox));
}

function isValidEditorTextBox(value: StickerEditorTextBox): boolean {
    return typeof value.text === "string"
        && value.text.length <= 10_000
        && Number.isFinite(value.x)
        && Number.isFinite(value.y)
        && isPositiveFinite(value.boxWidth)
        && isPositiveFinite(value.boxHeight)
        && isPositiveFinite(value.fontSize)
        && (value.lineHeight === undefined || (isPositiveFinite(value.lineHeight) && value.lineHeight <= 5))
        && typeof value.color === "string"
        && value.color.length <= 100
        && (value.align === "left" || value.align === "center" || value.align === "right")
        && (value.verticalAlign === "top" || value.verticalAlign === "middle" || value.verticalAlign === "bottom");
}

function isPngDataUrl(value: unknown): value is string {
    return typeof value === "string" && value.startsWith("data:image/png;base64,");
}

function isPositiveFinite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

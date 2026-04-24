/**
 * PNG binary 헤더 파싱 유틸. 완전 이미지 디코딩은 불필요 — 크기/포맷 검증만.
 *
 * PNG 스펙: https://www.w3.org/TR/png/
 *   signature (8 bytes): 89 50 4E 47 0D 0A 1A 0A
 *   chunk[0] IHDR: length(4, BE) + "IHDR"(4) + data(13) + crc(4)
 *     data: width(4, BE) + height(4, BE) + bit_depth(1) + color_type(1) + ...
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_NAME = {
    0: "grayscale",
    2: "rgb",
    3: "palette",
    4: "grayscale_alpha",
    6: "rgba",
};
export function readPngInfo(buf) {
    if (buf.length < 8 + 8 + 13 + 4)
        return null;
    if (!buf.subarray(0, 8).equals(PNG_SIGNATURE))
        return null;
    // Chunk: 4 length + 4 type + data + 4 crc
    const firstChunkType = buf.subarray(12, 16).toString("ascii");
    if (firstChunkType !== "IHDR")
        return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const bitDepth = buf.readUInt8(24);
    const colorType = buf.readUInt8(25);
    return {
        width,
        height,
        bitDepth,
        colorType,
        colorTypeName: COLOR_TYPE_NAME[colorType] ?? "unknown",
        hasAlpha: colorType === 4 || colorType === 6,
    };
}
export function isPng(buf) {
    return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}
//# sourceMappingURL=png.js.map
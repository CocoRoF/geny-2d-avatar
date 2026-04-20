export const CATEGORY_ORDER = ["Face", "Hair", "Body", "Accessory"];
export function categoryOf(role) {
    if (role.startsWith("eye_") ||
        role.startsWith("brow_") ||
        role.startsWith("mouth_") ||
        role.startsWith("face_") ||
        role === "nose" ||
        role === "cheek_blush")
        return "Face";
    if (role.startsWith("hair_") || role === "ahoge")
        return "Hair";
    if (role.startsWith("arm_") ||
        role.startsWith("cloth_") ||
        role === "torso" ||
        role === "neck" ||
        role === "body" ||
        role === "limb" ||
        role === "clothing")
        return "Body";
    if (role.startsWith("accessory_") || role === "accessory")
        return "Accessory";
    return "Other";
}
export function categorize(parts) {
    const groups = new Map();
    for (const p of parts) {
        const cat = categoryOf(p.role);
        let list = groups.get(cat);
        if (!list) {
            list = [];
            groups.set(cat, list);
        }
        list.push(p);
    }
    for (const list of groups.values()) {
        list.sort((a, b) => a.slot_id.localeCompare(b.slot_id));
    }
    return groups;
}
//# sourceMappingURL=category.js.map
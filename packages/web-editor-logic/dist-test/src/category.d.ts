export type Category = "Face" | "Hair" | "Body" | "Accessory" | "Other";
export declare const CATEGORY_ORDER: readonly Category[];
export interface PartLike {
    readonly role: string;
    readonly slot_id: string;
}
export declare function categoryOf(role: string): Category;
export declare function categorize<P extends PartLike>(parts: readonly P[]): Map<Category, P[]>;
//# sourceMappingURL=category.d.ts.map
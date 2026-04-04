/**
 * Gmail treats dots in the local part as equivalent; googlemail.com aliases gmail.com.
 * Mobile Google Sign-In and web NextAuth may return different string forms for the same mailbox.
 */

export function canonicalIdentityEmail(email: string): string {
    const trimmed = email.trim().toLowerCase();
    const at = trimmed.lastIndexOf('@');
    if (at <= 0) return trimmed;
    let local = trimmed.slice(0, at);
    let domain = trimmed.slice(at + 1);
    if (domain === 'googlemail.com') domain = 'gmail.com';
    if (domain === 'gmail.com') {
        local = local.replace(/\./g, '');
    }
    return `${local}@${domain}`;
}

/** OData string literal escape for Azure Table filter values */
export function escapeODataString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Partition keys that may exist in Table Storage from legacy writes (raw lowercased email)
 * and canonical keys used for new rows.
 */
export function identityEmailPartitionKeysForQuery(email: string): string[] {
    const trimmed = email.trim().toLowerCase();
    const keys = new Set<string>();
    keys.add(trimmed);
    keys.add(canonicalIdentityEmail(email));

    const at = trimmed.lastIndexOf('@');
    if (at > 0) {
        const local = trimmed.slice(0, at);
        const domain = trimmed.slice(at + 1);
        if (domain === 'gmail.com' || domain === 'googlemail.com') {
            const stripped = local.replace(/\./g, '');
            keys.add(`${stripped}@gmail.com`);
            keys.add(`${stripped}@googlemail.com`);
            keys.add(`${local}@gmail.com`);
            keys.add(`${local}@googlemail.com`);
        }
    }
    return Array.from(keys);
}

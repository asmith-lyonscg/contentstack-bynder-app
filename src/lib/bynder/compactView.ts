/** GraphQL fields Compact View should return for crop + optional DAT. */
export const COMPACT_ASSET_FIELD_SELECTION = `
  id
  name
  databaseId
  url
  originalUrl
  type
  derivatives {
    thumbnail
    webImage
  }
`;

/** Contentstack iframe height while Compact View’s modal is open. */
export const COMPACT_PICKER_HEIGHT = 720;

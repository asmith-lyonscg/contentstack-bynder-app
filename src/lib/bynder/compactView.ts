/** GraphQL fields Compact View should return on confirm (getAsset / getAssets). */
export const COMPACT_ASSET_FIELD_SELECTION = `
  id
  name
  description
  databaseId
  createdAt
  originalUrl
  publishedAt
  tags
  type
  updatedAt
  url
  extensions
  metaproperties {
    nodes {
      name
      type
      options {
        name
        displayLabel
      }
    }
  }
  textMetaproperties {
    name
    value
    label
  }
  derivatives {
    thumbnail
    webImage
  }
  files
  ... on Image {
    width
    height
  }
  ... on Video {
    previewUrls
    streamingLinks {
      dash
      hls
      embedCode
    }
    videoPresets {
      presetId
      name
      format
      previewUrl
    }
  }
`;

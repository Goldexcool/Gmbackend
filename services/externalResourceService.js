const axios = require('axios');

// API keys should be stored in your environment variables
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || '';
const CORE_API_KEY = process.env.CORE_API_KEY || '';

// Google Books API
const googleBooksAPI = {
  search: async (query, maxResults = 10) => {
    try {
      const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
        params: {
          q: query,
          maxResults: maxResults,
          key: GOOGLE_BOOKS_API_KEY
        }
      });

      if (!response.data.items) return [];

      return response.data.items.map(book => ({
        id: book.id,
        title: book.volumeInfo.title,
        description: book.volumeInfo.description || '',
        authors: book.volumeInfo.authors || ['Unknown'],
        publishedDate: book.volumeInfo.publishedDate,
        thumbnail: book.volumeInfo.imageLinks ? book.volumeInfo.imageLinks.thumbnail : null,
        previewLink: book.volumeInfo.previewLink,
        infoLink: book.volumeInfo.infoLink,
        source: 'Google Books',
        externalId: book.id
      }));
    } catch (error) {
      console.error('Error fetching from Google Books API:', error);
      return [];
    }
  }
};

// Open Library API
const openLibraryAPI = {
  search: async (query, limit = 10) => {
    try {
      const response = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`);
      
      if (!response.data.docs) return [];
      
      return response.data.docs.map(book => ({
        id: book.key,
        title: book.title,
        description: '',
        authors: book.author_name || ['Unknown'],
        publishedDate: book.first_publish_year ? book.first_publish_year.toString() : '',
        thumbnail: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
        previewLink: `https://openlibrary.org${book.key}`,
        infoLink: `https://openlibrary.org${book.key}`,
        source: 'Open Library',
        externalId: book.key
      }));
    } catch (error) {
      console.error('Error fetching from Open Library API:', error);
      return [];
    }
  }
};

// CORE API (Research Papers)
const coreAPI = {
  search: async (query, limit = 10) => {
    if (!CORE_API_KEY) return [];
    
    try {
      const response = await axios.get('https://core.ac.uk/api-v2/search', {
        params: {
          q: query,
          limit: limit
        },
        headers: {
          'Authorization': `Bearer ${CORE_API_KEY}`
        }
      });
      
      if (!response.data.data) return [];
      
      return response.data.data.map(paper => ({
        id: paper.id,
        title: paper.title,
        description: paper.description || '',
        authors: paper.authors ? paper.authors.map(a => a.name) : ['Unknown'],
        publishedDate: paper.year ? paper.year.toString() : '',
        thumbnail: null,
        previewLink: paper.downloadUrl || paper.url,
        infoLink: paper.url,
        source: 'CORE',
        externalId: paper.id,
        pdfUrl: paper.downloadUrl
      }));
    } catch (error) {
      console.error('Error fetching from CORE API:', error);
      return [];
    }
  }
};

// arXiv API
const arxivAPI = {
  search: async (query, limit = 10) => {
    try {
      const response = await axios.get(`http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=${limit}`);
      
      // For now, just return empty array as XML parsing is more complex
      // We'll implement a simplified version
      return [];
    } catch (error) {
      console.error('Error fetching from arXiv API:', error);
      return [];
    }
  }
};

// Helper function to format resource data from external APIs
const formatResourceData = (resource, source) => {
  return {
    title: resource.title,
    description: resource.description || '',
    resourceType: source === 'CORE' ? 'journal' : 'textbook',
    format: 'link',
    author: Array.isArray(resource.authors) 
      ? resource.authors.join(', ') 
      : (resource.authors || 'Unknown'),
    publisher: resource.publisher || '',
    publicationYear: resource.publishedDate 
      ? parseInt(resource.publishedDate.substring(0, 4)) 
      : null,
    externalLink: resource.previewLink || resource.infoLink || resource.url,
    thumbnail: resource.thumbnail || '',
    source: {
      name: source,
      url: resource.infoLink || resource.url,
      apiRef: resource.id || resource.externalId
    }
  };
};

/**
 * Import a resource from external API to our database
 */
const importExternalResource = async (resourceData, userId, accessLevel = 'public') => {
  try {
    // This is a placeholder - you'll need to implement the actual import logic
    // based on your Resource model
    console.log('Importing external resource:', resourceData);
    return { _id: 'placeholder', ...resourceData };
  } catch (error) {
    console.error('Error importing resource:', error);
    throw error;
  }
};

/**
 * Main search function that aggregates results from multiple sources
 */
const searchAllSources = async (query, options = {}) => {
  const { maxResults = 20, sources = ['local', 'googleBooks', 'core'] } = options;
  
  const results = {
    googleBooks: [],
    openLibrary: [],
    core: [],
    arxiv: []
  };

  const promises = [];

  // Search external APIs
  if (sources.includes('googleBooks')) {
    promises.push(
      googleBooksAPI.search(query, maxResults).then(data => {
        results.googleBooks = data;
      })
    );
  }

  if (sources.includes('openLibrary')) {
    promises.push(
      openLibraryAPI.search(query, maxResults).then(data => {
        results.openLibrary = data;
      })
    );
  }

  if (sources.includes('core')) {
    promises.push(
      coreAPI.search(query, maxResults).then(data => {
        results.core = data;
      })
    );
  }

  if (sources.includes('arxiv')) {
    promises.push(
      arxivAPI.search(query, maxResults).then(data => {
        results.arxiv = data;
      })
    );
  }

  await Promise.all(promises);

  return {
    external: {
      googleBooks: results.googleBooks,
      openLibrary: results.openLibrary,
      core: results.core,
      arxiv: results.arxiv
    }
  };
};

module.exports = {
  googleBooksAPI,
  openLibraryAPI,
  coreAPI,
  arxivAPI,
  formatResourceData,
  importExternalResource,
  searchAllSources
};
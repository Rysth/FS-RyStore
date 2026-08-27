import { useEffect } from 'react';
import { useBusinessStore } from '../stores/businessStore';

export const useDocumentTitle = () => {
  const { publicBusiness, fetchPublicBusiness } = useBusinessStore();

  useEffect(() => {
    // Fetch business data if not already loaded
    if (!publicBusiness) {
      fetchPublicBusiness();
    }
  }, [publicBusiness, fetchPublicBusiness]);

  useEffect(() => {
    // Update document title when business data is available
    if (publicBusiness?.name) {
      const title = `${publicBusiness.name}${publicBusiness.slogan ? ` | ${publicBusiness.slogan}` : ''}`;
      document.title = title;
    } else {
      // Fallback title
      document.title = 'MicroBiz | Powered by RysthDesign';
    }

    // Update favicon if business logo is available
    if (publicBusiness?.logo_url) {
      updateFavicon(publicBusiness.logo_url);
    } else {
      // Fallback to default favicon
      updateFavicon('/logo.svg');
    }
  }, [publicBusiness]);

  // Helper function to update favicon
  const updateFavicon = (iconUrl: string) => {
    // Remove existing favicon
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (existingFavicon) {
      existingFavicon.remove();
    }

    // Create new favicon link
    const newFavicon = document.createElement('link');
    newFavicon.rel = 'icon';
    newFavicon.type = 'image/x-icon';
    newFavicon.href = iconUrl;
    
    // Add the new favicon to the head
    document.head.appendChild(newFavicon);
  };

  return publicBusiness;
};
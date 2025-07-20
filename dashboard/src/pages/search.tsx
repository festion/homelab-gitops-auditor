import React from 'react';
import { SearchDashboard } from '../components/search';

/**
 * Search Page
 * Provides advanced repository search and filtering capabilities
 */
const SearchPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SearchDashboard />
      </div>
    </div>
  );
};

export default SearchPage;
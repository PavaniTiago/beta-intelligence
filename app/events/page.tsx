"use client";

import { PageHeader } from "@/components/page-header";
import { useQuery } from "@tanstack/react-query";
import { EventsTable } from "./events-table";
import { createClient } from "@/utils/supabase/client";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { redirect, useRouter, useSearchParams, usePathname } from "next/navigation";
import { 
  toBrazilianTime, 
  formatBrazilianDate, 
  getBrazilianStartOfDay, 
  getBrazilianEndOfDay, 
  BRAZIL_TIMEZONE 
} from '@/lib/date-utils';

const fetchEvents = async ({ queryKey }: any) => {
  const [_, page, limit, sortConfig, searchParamsString] = queryKey;
  const searchParams = new URLSearchParams(searchParamsString);
  
  console.log('Original search params for API request:', searchParamsString);
  
  // Criar uma nova instância de URLSearchParams para a requisição
  const params = new URLSearchParams();
  
  // Adicionar apenas parâmetros básicos
  params.set('page', page.toString());
  params.set('limit', limit.toString());
  
  // Adicionar parâmetros de ordenação
  if (sortConfig.column) {
    params.set('sortBy', sortConfig.column);
    if (sortConfig.direction) {
      params.set('sortDirection', sortConfig.direction);
    }
  }
  
  // CHECK FOR FILTER CLEARING FLAG
  // If we detect this is a request after filter clearing, use only minimal parameters
  const isFilterClearingRequest = sessionStorage.getItem('filter_clearing_in_progress') === 'true';
  
  if (isFilterClearingRequest) {
    console.log('API REQUEST: FILTER CLEARING DETECTED - USANDO APENAS PAGINAÇÃO E ORDENAÇÃO');
    
    // When clearing filters, don't add any filter parameters at all
    // Use ONLY pagination and sorting
    
    // Get final parameters for API call
    const paramString = params.toString();
    console.log('MINIMAL API request params:', paramString);
    
    // Clear the filter clearing flag before making the request
    sessionStorage.removeItem('filter_clearing_in_progress');
    
    try {
      // Make the API request with minimal parameters
      const response = await fetch(`/api/events?${paramString}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', { status: response.status, text: errorText });
        throw new Error(`Falha ao buscar eventos: ${response.status} ${errorText.substring(0, 100)}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fetch error during filter clearing:', error);
      throw error;
    }
  }
  
  // NORMAL REQUEST FLOW (NOT FILTER CLEARING)
  // Verificar se há parâmetros de filtro na URL
  const hasFilters = searchParams.has('from') || 
                     searchParams.has('to') ||
                     searchParams.has('advanced_filters') ||
                     searchParams.has('filter_condition') ||
                     searchParams.has('profession_id') ||
                     searchParams.has('funnel_id') ||
                     searchParams.has('time_from') ||
                     searchParams.has('time_to') ||
                     searchParams.has('filters');
  
  // Se não houver nenhum filtro, não inclua nenhum parâmetro de filtro na chamada da API
  if (!hasFilters) {
    console.log('No filters detected in URL - sending minimal API request');
    
    // Final parameters: only pagination and sorting
    const paramString = params.toString();
    console.log('Final API request params (no filters):', paramString);
    
    try {
      const response = await fetch(`/api/events?${paramString}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', { status: response.status, text: errorText });
        throw new Error(`Falha ao buscar eventos: ${response.status} ${errorText.substring(0, 100)}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }
  
  // Se houver filtros, copie-os da URL para a requisição API
  // Copy parameters from current URL, with special handling for filter parameters
  const paramsEntries = Array.from(searchParams.entries());
  
  // Add all parameters from URL, with special handling for filters
  for (const [key, value] of paramsEntries) {
    if (key !== 'page' && key !== 'limit' && key !== 'sortBy' && key !== 'sortDirection') {
      // Check if this is a filter parameter that should be included
      const isFilterParam = ['advanced_filters', 'filter_condition', 'profession_id', 'funnel_id', 'time_from', 'time_to', 'filters', 'from', 'to'].includes(key);
      
      // Handle advanced filters and other filter parameters carefully
      if (isFilterParam) {
        if (key === 'advanced_filters' || key === 'filters') {
          // Ensure we're passing a valid JSON string
          try {
            // Validate JSON format
            const parsed = JSON.parse(value);
            
            // Verify this is an array with actual values
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.some((f: any) => f.value && f.value.trim() !== '')) {
              // Set the appropriate parameter
              params.set(key, JSON.stringify(parsed));
              console.log(`Valid ${key} included in API request`);
              
              // Add filter condition if it exists
              const filterCondition = searchParams.get('filter_condition');
              if (filterCondition && key === 'advanced_filters') {
                params.set('filter_condition', filterCondition);
              }
            } else {
              console.log(`Empty or invalid ${key} array - skipping`);
            }
          } catch (e) {
            console.error(`Error parsing ${key}:`, e);
            // Don't include invalid filter values
          }
        } else {
          // For other filter parameters (like profession_id), include only if they have a value
          if (value && value.trim() !== '') {
            params.set(key, value);
          }
        }
      } else {
        // Non-filter parameters are included as-is
        params.set(key, value);
      }
    }
  }
  
  // Get final parameters for API call
  const paramString = params.toString();
  console.log('Final API request params:', paramString);
  
  try {
    // Make the API request
    const response = await fetch(`/api/events?${paramString}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error:', { status: response.status, text: errorText });
      throw new Error(`Falha ao buscar eventos: ${response.status} ${errorText.substring(0, 100)}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

// Helper function to parse search params into filters
const parseSearchParams = (params: URLSearchParams): any[] => {
  let parsedFilters: any[] = [];
  
  try {
    // First try to get 'filters' param (for backward compatibility)
    const filterParam = params.get('filters');
    if (filterParam) {
      const decoded = JSON.parse(filterParam);
      if (Array.isArray(decoded)) {
        parsedFilters = decoded;
        console.log('Using legacy "filters" parameter');
      } else {
        console.error('Filters is not an array, checking advanced_filters');
      }
    }
    
    // If we didn't get valid filters or they're empty, try advanced_filters
    if (parsedFilters.length === 0) {
      const advancedFiltersParam = params.get('advanced_filters');
      if (advancedFiltersParam) {
        console.log('Found advanced_filters parameter');
        const decoded = JSON.parse(advancedFiltersParam);
        if (Array.isArray(decoded)) {
          parsedFilters = decoded;
          console.log('Successfully parsed advanced_filters');
        } else {
          console.error('advanced_filters is not an array:', typeof decoded);
        }
      }
    }
  } catch (e) {
    console.error('Error parsing filter parameters from URL:', e);
  }
  
  return parsedFilters;
};

function EventsContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  // State management
  const [isMounted, setIsMounted] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<any[]>([]);
  const [hasSearchParamsChanged, setHasSearchParamsChanged] = useState(false);
  
  // Usar uma ref para manter o último searchParams processado
  const lastSearchParamsRef = useRef(searchParams.toString());
  
  // Enhanced loading state management 
  const [isManualLoading, setIsManualLoading] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if a refetch is in progress to prevent duplicates
  const isRefetchingRef = useRef(false);
  const blockRefetchRef = useRef(false);
  
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.get('page')) || 1
  );
  const [limit, setLimit] = useState(
    Number(searchParams.get('limit')) || 10
  );
  const [hasCalculatedLimit, setHasCalculatedLimit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{
    column: string | null;
    direction: 'asc' | 'desc' | null;
  }>({
    column: searchParams.get('sortBy') as string | null,
    direction: searchParams.get('sortDirection') as 'asc' | 'desc' | null
  });

  // Set isMounted to true after component mounts
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Helper to safely set loading state with timeout cancellation
  const startLoading = useCallback(() => {
    // Clear any existing timeout to prevent race conditions
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    setIsManualLoading(true);
  }, []);
  
  const stopLoading = useCallback((delay = 300) => {
    // Use timeout to prevent flickering for quick operations
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    loadingTimeoutRef.current = setTimeout(() => {
      setIsManualLoading(false);
      loadingTimeoutRef.current = null;
    }, delay);
  }, []);

  // Buscar eventos com React Query
  const { 
    data: eventsData, 
    isLoading, 
    error,
    refetch
  } = useQuery({
    queryKey: ["events", currentPage, limit, sortConfig, searchParams.toString()],
    queryFn: async () => {
      return fetchEvents({ 
        queryKey: ["events", currentPage, limit, sortConfig, searchParams.toString()]
      });
    },
    staleTime: 1 * 60 * 1000, // 1 minuto (reduzido para ser mais responsivo)
    gcTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 500,
    placeholderData: (previousData) => previousData,
  });
  
  // Safer refetch function that prevents duplicates and manages loading state
  const safeRefetch = useCallback(() => {
    // If already refetching, skip this request
    if (isRefetchingRef.current) {
      console.log('Skipping duplicate refetch request');
      return;
    }
    
    isRefetchingRef.current = true;
    startLoading();
    
    // Small delay to ensure URL is updated before refetch
    setTimeout(() => {
      refetch()
        .catch(err => console.error('Error during refetch:', err))
        .finally(() => {
          stopLoading();
          isRefetchingRef.current = false;
        });
    }, 50);
  }, [refetch, startLoading, stopLoading]);

  // Trigger safeRefetch when refetch-events is dispatched
  useEffect(() => {
    const refetchHandler = () => {
      if (blockRefetchRef.current) return;
      safeRefetch();
    };
    
    window.addEventListener('refetch-events', refetchHandler);
    return () => window.removeEventListener('refetch-events', refetchHandler);
  }, [safeRefetch]);

  // Handle advanced filters change
  useEffect(() => {
    // Set mounted state
    setIsMounted(true);
    
    // Check if searchParams have changed
    if (searchParams.toString() !== lastSearchParamsRef.current) {
      const currentParams = new URLSearchParams(searchParams.toString());
      const lastParams = new URLSearchParams(lastSearchParamsRef.current);
      
      // Don't restore filters if filter clearing is in progress
      const isFilterClearing = sessionStorage.getItem('filter_clearing_in_progress') === 'true';
      if (isFilterClearing) {
        // Just update the ref and move on
        lastSearchParamsRef.current = searchParams.toString();
        return;
      }
      
      // Get current values of advanced filters
      const currentAdvancedFilters = currentParams.get('advanced_filters');
      const previousAdvancedFilters = lastParams.get('advanced_filters');
      
      // Log for debugging
      if (currentAdvancedFilters) {
        console.log('Advanced filters present:', currentAdvancedFilters.substring(0, 50) + '...');
      }
      
      // Check if advanced filters disappeared
      if (previousAdvancedFilters && !currentAdvancedFilters) {
        // Check if this is an intentional clearing operation
        // Quando limpamos os filtros, a URL terá apenas page, limit, sortBy e sortDirection (sem from/to)
        const isIntentionalClearing = 
          (Array.from(currentParams.keys()).length <= 4) || // URL limpa com apenas parâmetros básicos
          sessionStorage.getItem('filter_clearing_in_progress') === 'true' || // Flag de limpeza ativa
          sessionStorage.getItem('advanced_filters_removed') === 'true'; // Flag especial para remoção de filtros
        
        if (!isIntentionalClearing) {
          console.log('Advanced filters were lost, restoring them');
          currentParams.set('advanced_filters', previousAdvancedFilters);
          
          // Also restore filter condition if it was lost
          const prevFilterCondition = lastParams.get('filter_condition');
          if (prevFilterCondition) {
            currentParams.set('filter_condition', prevFilterCondition);
          }
          
          // Update URL without triggering navigation events
          blockRefetchRef.current = true;
          router.replace(`/events?${currentParams.toString()}`, { scroll: false });
          
          // Allow refetches after a short delay
          setTimeout(() => {
            blockRefetchRef.current = false;
          }, 100);
        } else {
          console.log('Detected intentional filter clearing - not restoring filters');
        }
      }
      
      // Update the reference to current search params
      lastSearchParamsRef.current = searchParams.toString();
      setHasSearchParamsChanged(true);
      
      // Parse search params into filters
      const parsedFilters = parseSearchParams(currentParams);
      setAdvancedFilters(parsedFilters || []);
    }
    
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [searchParams, router]);

  // Refetch when search params change
  useEffect(() => {
    if (hasSearchParamsChanged && isMounted) {
      console.log('Search params changed, triggering refetch');
      
      // Verificar se os filtros foram limpos
      const currentParams = new URLSearchParams(searchParams.toString());
      const isFilterClearing = 
        sessionStorage.getItem('filter_clearing_in_progress') === 'true' || 
        sessionStorage.getItem('advanced_filters_removed') === 'true';
      
      // Se não há filtros avançados na URL e temos flags de limpeza, resetar o estado
      if (!currentParams.has('advanced_filters') && isFilterClearing) {
        console.log('Resetando estado advancedFilters porque os filtros foram limpos');
        setAdvancedFilters([]);
      }
      
      setHasSearchParamsChanged(false);
      safeRefetch();
    }
  }, [hasSearchParamsChanged, isMounted, safeRefetch, searchParams]);

  // Calcular linhas visíveis uma única vez na montagem
  useEffect(() => {
    if (hasCalculatedLimit) return;
    
    const calculateVisibleRows = () => {
      if (!containerRef.current) return;
      
      const windowHeight = window.innerHeight;
      const headerHeight = 70;
      const filtersHeight = 80;
      const paginationHeight = 50;
      const padding = 40;
      
      const availableHeight = windowHeight - headerHeight - filtersHeight - paginationHeight - padding;
      const rowHeight = 46;
      const headerRowHeight = 48;
      
      const visibleRows = Math.max(5, Math.floor((availableHeight - headerRowHeight) / rowHeight));
      
      // Só atualiza se o valor calculado for diferente do atual
      if (visibleRows !== limit) {
        setLimit(visibleRows);
        setHasCalculatedLimit(true);
        
        // Atualizar URL apenas quando necessário
        const params = new URLSearchParams(searchParams.toString());
        params.set('limit', visibleRows.toString());
        router.push(`/events?${params.toString()}`, { scroll: false });
      } else {
        setHasCalculatedLimit(true);
      }
    };
    
    // Usar setTimeout para garantir que o layout está estável
    setTimeout(calculateVisibleRows, 100);
  }, [hasCalculatedLimit, limit, router, searchParams]);

  // Sincronizar o estado currentPage com o parâmetro page da URL
  useEffect(() => {
    const pageParam = searchParams.get('page');
    const pageNumber = pageParam ? parseInt(pageParam, 10) : 1;
    
    // Só atualiza se for diferente para evitar loops
    if (pageNumber !== currentPage) {
      setCurrentPage(pageNumber);
    }
  }, [searchParams, currentPage]);

  // Efeito para inicializar os parâmetros de data se não existirem
  const initialUrlSetupRef = useRef(false);
  
  // Function to set current day filter and reload data
  const setCurrentDayFilter = useCallback(() => {
    const today = new Date();
    const brazilianToday = toBrazilianTime(today);
    const startOfDay = getBrazilianStartOfDay(brazilianToday);
    const endOfDay = getBrazilianEndOfDay(brazilianToday);
    
    console.log("Setting current day filter:", { startOfDay, endOfDay });
    
    // Create new params while preserving other filters
    const params = new URLSearchParams(searchParams.toString());
    
    // Set date range to current day
    params.set('from', startOfDay);
    params.set('to', endOfDay);
    
    // Explicitly set page to 1
    params.set('page', '1');
    
    // Store in session storage to persist across page refreshes
    // Set a flag to indicate that we've already done the initial setup
    localStorage.setItem('events_initial_setup_done', 'true');
    sessionStorage.setItem('events_default_filter_applied', 'true');
    sessionStorage.setItem('events_from_date', startOfDay);
    sessionStorage.setItem('events_to_date', endOfDay);
    
    // Update URL without reloading - use replace to avoid adding to history
    router.replace(`/events?${params.toString()}`, { scroll: false });
    
    // Trigger refetch
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('refetch-events'));
    }, 100);
  }, [router, searchParams]);
  
  // Use the function in the initialization effect
  useEffect(() => {
    // Evitar execução múltipla
    if (initialUrlSetupRef.current) return;
    
    // Check if we're on the exact URL /events without any parameters
    const hasNoParams = searchParams.toString() === '';
    
    // Marcar como inicializado para evitar múltiplas execuções
    initialUrlSetupRef.current = true;
    
    // For clean URLs (first entry), just set page=1 without any date filters
    if (hasNoParams) {
      console.log("First entry with clean URL - setting just page=1");
      
      // Simplify URL to just page=1
      router.replace('/events?page=1', { scroll: false });
      
      // Note: We don't set any date filters here automatically
      // Mark that we've done initial setup
      localStorage.setItem('events_initial_setup_done', 'true');
      return;
    }
    
    // For URLs with params but missing page, add page=1
    const pageParam = searchParams.get('page');
    if (!pageParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', '1');
      
      // Update URL without reloading
      router.replace(`/events?${params.toString()}`, { scroll: false });
    }
    
    // Fix incorrect date formats if needed, but only if they already exist in URL
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    if ((fromParam && !fromParam.includes('-03:00')) || (toParam && !toParam.includes('-03:00'))) {
      console.log("Fixing date format in existing parameters");
      
      // Criar novos parâmetros mantendo os existentes
      const params = new URLSearchParams(searchParams.toString());
      
      // Verificar e corrigir formato
      if (fromParam && !fromParam.includes('-03:00')) {
        const fromDate = toBrazilianTime(new Date(fromParam));
        params.set('from', getBrazilianStartOfDay(fromDate));
      }
      
      if (toParam && !toParam.includes('-03:00')) {
        const toDate = toBrazilianTime(new Date(toParam));
        params.set('to', getBrazilianEndOfDay(toDate));
      }
      
      // Ensure page=1 is in the URL
      params.set('page', '1');
      
      // Preserve advanced filters if they exist
      const advancedFiltersParam = searchParams.get('advanced_filters');
      if (advancedFiltersParam) {
        params.set('advanced_filters', advancedFiltersParam);
        
        // Also preserve filter condition if it exists
        const filterCondition = searchParams.get('filter_condition');
        if (filterCondition) {
          params.set('filter_condition', filterCondition);
        }
      }
      
      // Atualizar URL sem recarregar a página, usando replace
      router.replace(`/events?${params.toString()}`, { scroll: false });
      
      // Dispatch event to refetch data
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('refetch-events'));
      }, 100);
    }
    
  }, [searchParams, router]);
  
  if (!supabase.auth.getUser()) {
    return redirect("/sign-in");
  }

  // Updated function to use the improved loading utilities
  const handlePageChange = useCallback((newPage: number) => {
    // Prevent changing to same page when loading
    if (isManualLoading || isRefetchingRef.current || newPage === currentPage) {
      console.log('Skipping page change during loading or to same page');
      return;
    }
    
    // Start loading
    startLoading();
    
    // Obter os parâmetros atuais incluindo filtros avançados
    const params = new URLSearchParams(searchParams.toString());
    
    // Atualizar apenas o parâmetro de página, mantendo os demais
    params.set('page', newPage.toString());
    
    // Block refetch until we're ready
    blockRefetchRef.current = true;
    
    // Atualizar a URL preservando todos os outros parâmetros
    const newUrl = `/events?${params.toString()}`;
    router.push(newUrl, { scroll: false });
    
    // Enviar um evento customizado para forçar refetch após a mudança de URL
    setTimeout(() => {
      blockRefetchRef.current = false;
      const event = new CustomEvent('refetch-events');
      window.dispatchEvent(event);
    }, 100);
  }, [router, searchParams, currentPage, isManualLoading, startLoading]);

  // Update per-page change handler too
  const handlePerPageChange = useCallback((newLimit: number) => {
    if (isManualLoading || isRefetchingRef.current) {
      return;
    }
    
    startLoading();
    setLimit(newLimit);
    setCurrentPage(1); // Reset para primeira página
    
    // Atualizar URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', String(newLimit));
    params.set('page', '1');
    
    // Block refetch until we're ready
    blockRefetchRef.current = true;
    
    router.push(`/events?${params.toString()}`, { scroll: false });
    
    // Allow refetch after URL update
    setTimeout(() => {
      blockRefetchRef.current = false;
      window.dispatchEvent(new CustomEvent('refetch-events'));
    }, 100);
  }, [router, searchParams, isManualLoading, startLoading]);

  const handleSort = useCallback((columnId: string, direction: 'asc' | 'desc' | null) => {
    setSortConfig({ column: columnId, direction });
    
    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', columnId);
    params.set('sortDirection', direction || 'asc');
    
    router.push(`/events?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // Modificar o refetch para evitar ciclos infinitos e preservar filtros avançados
  useEffect(() => {
    const refetchHandler = () => {
      // Não fazer refetch se estamos bloqueando chamadas
      if (blockRefetchRef.current) return;
      
      // Set manual loading state when refetching
      setIsManualLoading(true);
      
      // Show loading state in UI immediately
      const loadingOverlay = document.querySelector('.table-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
      }
      
      // Preservar o filtro avançado atual antes do refetch
      const currentParams = new URLSearchParams(searchParams.toString());
      const advancedFiltersParam = currentParams.get('advanced_filters');
      
      // Ensure we're not already refetching
      if (isRefetchingRef.current) {
        console.log('Already refetching, ignoring request');
        return;
      }
      
      // Set refetching flag
      isRefetchingRef.current = true;
      
      // Forçar um refetch imediato
      refetch().finally(() => {
        // Verificar se o filtro ainda existe após o refetch
        const newParams = new URLSearchParams(searchParams.toString());
        const hasAdvancedFilters = newParams.has('advanced_filters');
        
        // Se os filtros avançados estavam presentes mas sumiram, restaurá-los
        if (advancedFiltersParam && 
            !hasAdvancedFilters && 
            !sessionStorage.getItem('filter_clearing_in_progress') &&
            !sessionStorage.getItem('advanced_filters_removed')) {
          console.log('Restaurando filtros avançados que foram removidos');
          newParams.set('advanced_filters', advancedFiltersParam);
          
          // Se havia uma condição de filtro, também preservá-la
          const filterCondition = currentParams.get('filter_condition');
          if (filterCondition) {
            newParams.set('filter_condition', filterCondition);
          }
          
          // Atualizar URL sem disparar outro refetch
          blockRefetchRef.current = true;
          router.replace(`/events?${newParams.toString()}`, { scroll: false });
          
          // Desbloquear após um curto período
          setTimeout(() => {
            blockRefetchRef.current = false;
          }, 100);
        }
        
        // Clear refetching flag
        isRefetchingRef.current = false;
        
        // Clear manual loading when refetch completes
        setIsManualLoading(false);
      });
    };
    
    window.addEventListener('refetch-events', refetchHandler);
    
    return () => {
      window.removeEventListener('refetch-events', refetchHandler);
    };
  }, [refetch, router, searchParams]);

  // Clear manual loading when query loading state changes
  useEffect(() => {
    if (!isLoading) {
      setIsManualLoading(false);
    }
  }, [isLoading]);

  // Add a function to handle clear filters events from the filters component
  useEffect(() => {
    // Function to handle events when filters have been cleared
    const handleFilterCleared = async () => {
      console.log('FORCE CLEARING ALL FILTERS AND CACHE...');
      
      // Set a special flag to indicate intentional removal of advanced filters
      sessionStorage.setItem('advanced_filters_removed', 'true');
      
      // Immediately start loading state and show it to the user
      startLoading();
      
      // Bloquear todos os refetches automáticos
      blockRefetchRef.current = true;
      
      // Sinalizar claramente que estamos limpando os filtros
      sessionStorage.setItem('filter_clearing_in_progress', 'true');
      
      try {
        // Limpar todos os itens de filtro do sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.includes('events_')) {
            sessionStorage.removeItem(key);
          }
        }
        
        // Pausar para garantir que o sessionStorage foi limpo
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Preservar apenas parâmetros essenciais não relacionados a filtros
        const sortBy = searchParams.get('sortBy');
        const sortDirection = searchParams.get('sortDirection');
        const limit = searchParams.get('limit');
        
        // Criar URL completamente nova do zero
        const cleanParams = new URLSearchParams();
        cleanParams.set('page', '1');
        
        // Adicionar apenas parâmetros preservados se existirem
        if (sortBy) cleanParams.set('sortBy', sortBy);
        if (sortDirection) cleanParams.set('sortDirection', sortDirection);
        if (limit) cleanParams.set('limit', limit);
        
        // Construir URL limpa
        const cleanUrl = `/events?${cleanParams.toString()}`;
        
        // Atualizar URL sem navegação
        window.history.replaceState({}, '', cleanUrl);
        
        // Em seguida, atualizar via router para garantir que todos os componentes atualizem
        await router.replace(cleanUrl, { scroll: false });
        
        // Resetar estado de filtros para array vazio
        setAdvancedFilters([]);
        
        // Pausar novamente para garantir que a URL foi atualizada
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Limpar o cache da query para evitar dados de filtro antigos
        await refetch();
        
        // Finalmente, permitir refetch e disparar evento para forçar a atualização da tabela
        blockRefetchRef.current = false;
        
        // Forçar um refetch imediato com request completamente nova
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refetch-events'));
        }
      } catch (error) {
        console.error('Erro durante a limpeza de filtros:', error);
        // Garantir que os bloqueios são removidos mesmo em caso de erro
        blockRefetchRef.current = false;
        sessionStorage.removeItem('filter_clearing_in_progress');
        stopLoading();
      } finally {
        // Garantir que a flag é removida em qualquer caso
        sessionStorage.removeItem('filter_clearing_in_progress');
        
        // Manter a flag advanced_filters_removed por um tempo para evitar restauração imediata
        setTimeout(() => {
          sessionStorage.removeItem('advanced_filters_removed');
        }, 5000); // Manter a flag por 5 segundos após a limpeza
      }
    };
    
    // Listen for the custom event
    window.addEventListener('filters-cleared', handleFilterCleared);
    
    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('filters-cleared', handleFilterCleared);
    };
  }, [router, startLoading, stopLoading, refetch]);

  // Effect to fetch events when search parameters change
  useEffect(() => {
    if (!isMounted) return;
    
    // Log for debugging
    console.log("Search params changed, checking if we should fetch...");
    
    // Check if filtering operation is in progress
    const filteringInProgress = sessionStorage.getItem('filter_clearing_in_progress') === 'true';
    
    // Don't fetch if block is active
    if (blockRefetchRef.current || filteringInProgress) {
      console.log("Fetch blocked by blockRefetchRef or filtering in progress");
      return;
    }

    // Compare new params with last params to see if anything changed
    const paramsChanged = JSON.stringify(searchParams) !== JSON.stringify(lastSearchParamsRef.current);
    
    if (paramsChanged) {
      console.log("Parameters changed - fetching new data");
      lastSearchParamsRef.current = searchParams.toString();
      
      // Start loading state
      setIsManualLoading(true);
      loadingTimeoutRef.current = setTimeout(() => {
        setIsManualLoading(false);
      }, 15000); // Safety timeout

      try {
        const filters = parseSearchParams(searchParams);
        setAdvancedFilters(filters);
        // Data will be fetched by the events table component
      } catch (error) {
        console.error("Error parsing search params:", error);
        setIsManualLoading(false);
      }
    } else {
      console.log("Parameters did not change - skip fetching");
    }

    return () => {
      // Clean up loading timeout if component unmounts
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [searchParams, isMounted]);

  return (
    <div className="flex flex-col h-full w-full" ref={containerRef}>
      <div className="w-full flex justify-between pb-4">
        <PageHeader pageTitle="Eventos" />
      </div>
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Log the first event to debug structure */}
        {eventsData?.events && eventsData.events.length > 0 && console.log('First event structure:', {
          event_id: eventsData.events[0].event_id,
          // Check for geographic fields at root level
          initialCountry: eventsData.events[0].initialCountry,
          initialRegion: eventsData.events[0].initialRegion,
          initialCity: eventsData.events[0].initialCity,
          initialCountryCode: eventsData.events[0].initialCountryCode,
          initialZip: eventsData.events[0].initialZip,
          initialIp: eventsData.events[0].initialIp,
          // Check user object 
          user_fullname: eventsData.events[0].user?.fullname,
          // Check if geographic fields might also be in user object
          user_initialCountry: eventsData.events[0].user?.initialCountry,
          // Check session object
          session_country: eventsData.events[0].session?.country
        })}
        
        {/* Log summary of events passed */}
        {eventsData?.events && console.log('Events passed to table:', {
          count: eventsData.events.length
        })}
        <EventsTable 
          events={eventsData?.events || []}
          meta={eventsData?.meta || {
            total: 0,
            page: currentPage,
            limit: limit,
            last_page: 1
          }}
          isLoading={isLoading || isManualLoading || !hasCalculatedLimit} 
          onSort={handleSort}
          onPerPageChange={handlePerPageChange}
          currentPage={currentPage}
          sortColumn={sortConfig.column}
          sortDirection={sortConfig.direction}
          searchParams={searchParams.toString()}
          onPageChange={handlePageChange}
        />

        {error && (
          <div className="text-red-500 p-4">
            Erro ao buscar eventos. Por favor, tente novamente.
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-8">Carregando...</div>}>
      <EventsContent />
    </Suspense>
  );
}
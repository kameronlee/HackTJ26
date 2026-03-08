import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from './App';
import { MapPin, Search } from 'lucide-react-native';

type Props = {
  navigation: BottomTabNavigationProp<RootTabParamList, 'Home'>;
};

// --- Custom OSM Nominatim Autocomplete Component ---
const OSMAutocomplete = ({ placeholder, onSelect }: { placeholder: string, onSelect: (coord: {latitude: number, longitude: number}) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // 500ms Debounce
    const timeoutId = setTimeout(() => {
      if (query.length > 2) {
        searchOSM(query);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const searchOSM = async (searchText: string) => {
    setIsSearching(true);
    try {
      // D.C. Area Viewbox for filtering
      const viewbox = "-77.1197,38.9955,-76.9093,38.7916";
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchText)}&format=jsonv2&viewbox=${viewbox}&bounded=1&addressdetails=1&limit=5`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CoolPathsApp/1.0' // Nominatim API requirement
        }
      });
      const data = await response.json();
      setResults(data);
      setShowDropdown(true);
    } catch (error) {
      console.error("OSM Search Error", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (item: any) => {
    setQuery(item.display_name.split(',')[0]); // Fill input with short name
    setShowDropdown(false);
    onSelect({
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon)
    });
  };

  return (
    <View style={styles.osmContainer}>
      <View style={styles.inputWrapper}>
        <Search size={20} color="#5f6368" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder={placeholder}
          value={query}
          onChangeText={(text) => {
             setQuery(text);
             if (!showDropdown && text.length > 2) setShowDropdown(true);
          }}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        />
        {isSearching && <ActivityIndicator size="small" color="#1a73e8" style={styles.loader} />}
      </View>

      {showDropdown && results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((item, index) => (
            <TouchableOpacity key={item.place_id || index} style={styles.resultItem} onPress={() => handleSelect(item)}>
              <MapPin size={16} color="#70757a" style={styles.resultIcon} />
              <View style={styles.resultTextContainer}>
                 <Text style={styles.resultMainText} numberOfLines={1}>{item.display_name.split(',')[0]}</Text>
                 <Text style={styles.resultSubText} numberOfLines={1}>{item.display_name}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

// --- Main Home Screen ---
export default function HomeScreen({ navigation }: Props) {
  const [startCoord, setStartCoord] = useState<{latitude: number, longitude: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [chatText, setChatText] = useState('');

  const handleRouteSubmit = () => {
    if (startCoord && destinationCoords) {
      navigation.navigate('Map', { startCoord, endCoord: destinationCoords });
    } else {
      // Default testing route if fields left blank
      navigation.navigate('Map', {
        startCoord: { latitude: 38.8906, longitude: -76.9803 }, // Eastern Senior High
        endCoord: { latitude: 38.8895, longitude: -77.0091 } // Capitol approx
      });
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        
        {/* Logo/Icon Placeholder */}
        <View style={styles.headerContainer}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>🌲 Cool Paths</Text>
          </View>
        </View>

        {/* Search Cards */}
        <View style={[styles.searchCard, {zIndex: 10}]}>
          <Text style={styles.label}>Origin</Text>
          <View style={{ zIndex: 20 }}>
             <OSMAutocomplete 
               placeholder="Where are you starting?" 
               onSelect={setStartCoord} 
             />
          </View>

          <Text style={styles.label}>Destination</Text>
          <View style={{ zIndex: 10 }}>
             <OSMAutocomplete 
               placeholder="Where are you going?" 
               onSelect={setDestinationCoords} 
             />
          </View>
        </View>

        {/* Chatbot Area */}
        <View style={styles.chatbotCard}>
          <Text style={styles.label}>AI Route Assistant</Text>
          <TextInput
            style={styles.chatInput}
            multiline
            placeholder="e.g. 'I want a shady, scenic walk to the park'"
            value={chatText}
            onChangeText={setChatText}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleRouteSubmit}>
          <Text style={styles.submitText}>Find Best Route</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 20, paddingTop: 60 },
  headerContainer: { alignItems: 'center', marginBottom: 30 },
  logoPlaceholder: { 
    width: 120, height: 120, backgroundColor: '#e6f4ea', 
    borderRadius: 60, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  logoText: { fontSize: 18, fontWeight: 'bold', color: '#188038' },
  searchCard: {
    backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#5f6368', marginBottom: 8 },
  chatbotCard: {
    backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
    zIndex: 1,
  },
  chatInput: {
    backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, minHeight: 100, fontSize: 16, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#e8eaed'
  },
  submitButton: { backgroundColor: '#1a73e8', padding: 18, borderRadius: 24, alignItems: 'center', zIndex: 1 },
  submitText: { color: 'white', fontSize: 18, fontWeight: '700' },
  
  // Custom OSM Autocomplete Styles
  osmContainer: { marginBottom: 16, position: 'relative' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f3f4', borderRadius: 8, paddingHorizontal: 12, height: 44, },
  inputIcon: { marginRight: 8 },
  textInput: { flex: 1, height: '100%', fontSize: 16 },
  loader: { marginLeft: 8 },
  dropdown: {
    position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: 'white',
    borderRadius: 8, paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
    zIndex: 100,
  },
  resultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f4' },
  resultIcon: { marginRight: 12 },
  resultTextContainer: { flex: 1 },
  resultMainText: { fontSize: 15, fontWeight: '500', color: '#202124' },
  resultSubText: { fontSize: 12, color: '#5f6368', marginTop: 2 }
});

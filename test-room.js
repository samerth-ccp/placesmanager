const testRefresh = async () => {
  try {
    console.log('Testing refresh endpoint...');
    const response = await fetch('http://localhost:5000/api/places/refresh');
    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
};

const testRoomCreation = async () => {
  try {
    // First, get available sections
    const sectionsResponse = await fetch('http://localhost:5000/api/places/parents');
    const sectionsData = await sectionsResponse.json();
    console.log('Available sections:', sectionsData.sections);
    
    if (sectionsData.sections && sectionsData.sections.length > 0) {
      const sectionId = sectionsData.sections[0].id;
      console.log('Using section ID:', sectionId);
      
      // Now create a room
      const response = await fetch('http://localhost:5000/api/places/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Room',
          sectionId: sectionId,
          description: 'Test room description',
          emailAddress: 'testroom@cloudpharmacy.com',
          capacity: 10,
          isBookable: true
        })
      });

      const result = await response.json();
      console.log('Room creation response status:', response.status);
      console.log('Room creation response body:', result);
    } else {
      console.log('No sections available');
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

const testDeletion = async () => {
  try {
    console.log('\n--- Testing deletion endpoints ---\n');
    
    // Get the hierarchy to see what we can delete
    const hierarchyResponse = await fetch('http://localhost:5000/api/places/hierarchy');
    const hierarchyData = await hierarchyResponse.json();
    console.log('Current hierarchy:', JSON.stringify(hierarchyData, null, 2));
    
    // Test deleting a room if available
    if (hierarchyData.buildings && hierarchyData.buildings.length > 0) {
      const building = hierarchyData.buildings[0];
      if (building.floors && building.floors.length > 0) {
        const floor = building.floors[0];
        if (floor.sections && floor.sections.length > 0) {
          const section = floor.sections[0];
          if (section.rooms && section.rooms.length > 0) {
            const room = section.rooms[0];
            console.log(`Testing deletion of room: ${room.name} (ID: ${room.id})`);
            
            const deleteResponse = await fetch(`http://localhost:5000/api/places/room/${room.id}`, {
              method: 'DELETE'
            });
            
            const deleteResult = await deleteResponse.json();
            console.log('Room deletion response status:', deleteResponse.status);
            console.log('Room deletion response body:', deleteResult);
          } else {
            console.log('No rooms available to test deletion');
          }
        } else {
          console.log('No sections available to test deletion');
        }
      } else {
        console.log('No floors available to test deletion');
      }
    } else {
      console.log('No buildings available to test deletion');
    }
  } catch (error) {
    console.error('Error testing deletion:', error);
  }
};

// Test all functions
testRefresh().then(() => {
  console.log('\n--- Now testing room creation ---\n');
  return testRoomCreation();
}).then(() => {
  console.log('\n--- Now testing deletion ---\n');
  return testDeletion();
}); 
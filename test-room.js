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
          capacity: 10,
          isBookable: true
        })
      });

      const result = await response.json();
      console.log('Response status:', response.status);
      console.log('Response body:', result);
    } else {
      console.log('No sections available');
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

testRoomCreation(); 
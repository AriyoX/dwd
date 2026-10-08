import { Redirect } from 'expo-router';

export default function TourScreen() {
  return <Redirect href={{ pathname: '/', params: { tour: '1' } }} />;
}
